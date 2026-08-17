import type { ClaimedOutboxEvent } from "@ai-hub/contracts";
import type { KyselyAuditRepository } from "./audit.repository.js";
import type { ObjectStoragePort } from "../../application/storage.port.js";
import type { AuditListInput } from "./audit.types.js";

export class AuditExportWorker {
  public constructor(
    private readonly repository: KyselyAuditRepository,
    private readonly storage: ObjectStoragePort,
  ) {}

  public handler = async (event: ClaimedOutboxEvent): Promise<void> => {
    const exportJobId = readExportJobId(event.payload) ?? event.aggregateId;
    const job = await this.repository.claimExportJob(exportJobId);
    if (job === null) return;
    try {
      const snapshot = asFilterSnapshot(job.filterSnapshot);
      const rows: unknown[] = [];
      let page = 1;
      while (true) {
        const result = await this.repository.listEvents({
          ...snapshot,
          page,
          pageSize: 200,
        });
        rows.push(...result.items);
        if (rows.length >= result.total || result.items.length === 0) break;
        page += 1;
      }
      const body = rows
        .map((row) =>
          JSON.stringify(row, (_key, value: unknown) =>
            value instanceof Date ? value.toISOString() : value,
          ),
        )
        .join("\n");
      const storageKey = `security/audit-exports/${exportJobId}.jsonl`;
      await this.storage.put(
        storageKey,
        Buffer.from(`${body}${body ? "\n" : ""}`),
      );
      await this.repository.completeExportJob({
        exportJobId,
        resultStorageKey: storageKey,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await this.repository.createEvent({
        module: "security",
        action: "security.audit.export.completed",
        actorEmployeeId: job.requestedByEmployeeId,
        subject: exportJobId,
        result: "success",
        risk: "low",
        details: { exportJobId, rowCount: rows.length, storageKey },
      });
    } catch (error) {
      const failureCode =
        error instanceof Error ? error.message : "AUDIT_EXPORT_FAILED";
      await this.repository.failExportJob({ exportJobId, failureCode });
      await this.repository.createEvent({
        module: "security",
        action: "security.audit.export.failed",
        actorEmployeeId: job.requestedByEmployeeId,
        subject: exportJobId,
        result: "error",
        risk: "high",
        details: { exportJobId, failureCode },
      });
      throw error;
    }
  };
}

function readExportJobId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload as { exportJobId?: unknown; details?: unknown };
  if (typeof value.exportJobId === "string") return value.exportJobId;
  if (typeof value.details !== "object" || value.details === null) return null;
  const details = value.details as { exportJobId?: unknown };
  return typeof details.exportJobId === "string" ? details.exportJobId : null;
}

function asFilterSnapshot(
  value: unknown,
): Omit<AuditListInput, "page" | "pageSize"> {
  if (typeof value !== "object" || value === null) return {};
  const snapshot = value as Record<string, unknown>;
  return {
    ...(typeof snapshot.keyword === "string"
      ? { keyword: snapshot.keyword }
      : {}),
    ...(typeof snapshot.module === "string" ? { module: snapshot.module } : {}),
    ...(typeof snapshot.action === "string" ? { action: snapshot.action } : {}),
    ...(typeof snapshot.actorEmployeeId === "string"
      ? { actorEmployeeId: snapshot.actorEmployeeId }
      : {}),
    ...(snapshot.result === "success" ||
    snapshot.result === "failure" ||
    snapshot.result === "denied" ||
    snapshot.result === "error"
      ? { result: snapshot.result as AuditListInput["result"] }
      : {}),
    ...(typeof snapshot.risk === "string" ? { risk: snapshot.risk } : {}),
    ...(typeof snapshot.from === "string" ? { from: snapshot.from } : {}),
    ...(typeof snapshot.to === "string" ? { to: snapshot.to } : {}),
  } as Omit<AuditListInput, "page" | "pageSize">;
}
