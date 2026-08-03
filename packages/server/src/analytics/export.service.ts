import { randomUUID } from "node:crypto";
import type { ActorContext } from "@ai-hub/contracts";
import type {
  AnalyticsExportRepository,
  AnalyticsExportRequest,
  AnalyticsExportResult,
} from "./export.types.js";

const EXPORT_ROLES = ["analytics_exporter", "analytics_operator", "super_admin"];

function canExport(actor: ActorContext): boolean {
  return EXPORT_ROLES.some((role) => actor.roleCodes.includes(role));
}

export class AnalyticsExportService {
  constructor(private readonly repository: AnalyticsExportRepository) {}

  async run(
    actor: ActorContext,
    request: AnalyticsExportRequest,
  ): Promise<AnalyticsExportResult> {
    if (!canExport(actor)) {
      throw new Error("ANALYTICS_EXPORT_FORBIDDEN");
    }
    const from = new Date(request.from);
    const to = new Date(request.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 180 * 24 * 60 * 60 * 1000
    ) {
      throw new Error("ANALYTICS_EXPORT_RANGE_INVALID");
    }
    const exportId = randomUUID();
    await this.repository.recordAudit({
      actorEmployeeId: actor.employeeId,
      action: "analytics.export.requested",
      exportId,
      details: { target: request.target, from: request.from, to: request.to },
    });
    try {
      const rows = await this.repository.readVisibleRows({ actor, request });
      const result: AnalyticsExportResult = {
        exportId,
        target: request.target,
        from: request.from,
        to: request.to,
        rows: rows.map((row) => ({
          aggregateId: row.aggregateId,
          occurredAt: row.occurredAt,
          value: row.value,
          requester:
            row.displayAnonymously === true
              ? "Anonymous"
              : actor.roleCodes.includes("analytics_identity_export")
                ? (row.requesterEmployeeId ?? null)
                : "Redacted",
        })),
      };
      await this.repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.export.completed",
        exportId,
        details: { rowCount: result.rows.length },
      });
      return result;
    } catch (error) {
      await this.repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.export.failed",
        exportId,
        details: {
          code: error instanceof Error ? error.message : "EXPORT_FAILED",
        },
      });
      throw error;
    }
  }

  async markDownloaded(actor: ActorContext, exportId: string): Promise<void> {
    if (!canExport(actor)) {
      throw new Error("ANALYTICS_EXPORT_FORBIDDEN");
    }
    await this.repository.recordAudit({
      actorEmployeeId: actor.employeeId,
      action: "analytics.export.downloaded",
      exportId,
      details: {},
    });
  }
}
