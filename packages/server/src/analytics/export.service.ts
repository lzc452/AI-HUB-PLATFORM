import { randomUUID } from "node:crypto";
import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
} from "@ai-hub/contracts";
import type {
  AnalyticsExportRepository,
  AnalyticsExportRequest,
  AnalyticsExportResult,
} from "./export.types.js";
import type { AnalyticsBehaviorEventRecorder } from "./analytics.types.js";
import { assertAnalyticsRange } from "./range.js";

function canExport(actor: ActorContext): boolean {
  return hasPermission(actor, PERMISSIONS.ANALYTICS_EXPORT);
}

const targetPermissions: Readonly<
  Record<AnalyticsExportRequest["target"], string>
> = {
  platform: PERMISSIONS.ANALYTICS_PLATFORM_READ,
  market: PERMISSIONS.ANALYTICS_MARKET_READ,
  application: PERMISSIONS.ANALYTICS_APPLICATION_READ,
  innovation: PERMISSIONS.ANALYTICS_INNOVATION_READ,
  review: PERMISSIONS.ANALYTICS_REVIEW_READ,
  department: PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
  risk: PERMISSIONS.ANALYTICS_RISK_READ,
  runtime: PERMISSIONS.ANALYTICS_RUNTIME_READ,
  integration: PERMISSIONS.ANALYTICS_INTEGRATION_READ,
};

export class AnalyticsExportService {
  constructor(
    private readonly repository: AnalyticsExportRepository,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
  ) {}

  async run(
    actor: ActorContext,
    request: AnalyticsExportRequest,
  ): Promise<AnalyticsExportResult> {
    if (
      !canExport(actor) ||
      !hasPermission(actor, targetPermissions[request.target])
    ) {
      await this.recordLifecycle(actor, "", "denied", {
        reason: "ANALYTICS_EXPORT_FORBIDDEN",
        target: request.target,
      });
      throw new Error("ANALYTICS_EXPORT_FORBIDDEN");
    }
    try {
      assertAnalyticsRange(request.from, request.to);
    } catch {
      await this.recordLifecycle(actor, "", "denied", {
        reason: "ANALYTICS_EXPORT_RANGE_INVALID",
        target: request.target,
      });
      throw new Error("ANALYTICS_EXPORT_RANGE_INVALID");
    }
    const result = await this.repository.withTransaction((repository) =>
      new AnalyticsExportService(repository).runInTransaction(actor, request),
    );
    await this.analyticsEvents?.record(actor, {
      eventName: "export_requested",
      aggregateType: "export",
      aggregateId: result.exportId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `export-requested:${result.exportId}`,
      metadata: { target: request.target },
    });
    return result;
  }

  private async runInTransaction(
    actor: ActorContext,
    request: AnalyticsExportRequest,
  ): Promise<AnalyticsExportResult> {
    const exportId = randomUUID();
    await this.repository.recordAudit({
      actorEmployeeId: actor.employeeId,
      action: "analytics.export.requested",
      exportId,
      details: { target: request.target, from: request.from, to: request.to },
    });
    await this.repository.appendOutbox({
      eventType: "analytics.export.requested",
      aggregateType: "export",
      aggregateId: exportId,
      payload: { target: request.target, from: request.from, to: request.to },
      idempotencyKey: `analytics.export.requested:${exportId}`,
    });
    try {
      const rows = await this.repository.readVisibleRows({
        actor,
        request,
        audienceScopeKeys: [
          `department:${actor.primaryDepartmentId}`,
          `employee:${actor.employeeId}`,
        ],
      });
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
              : hasPermission(actor, PERMISSIONS.ANALYTICS_IDENTITY_EXPORT)
                ? (row.requesterEmployeeId ?? null)
                : "Redacted",
        })),
      };
      for (const row of result.rows) {
        await this.repository.recordAudit({
          actorEmployeeId: actor.employeeId,
          action: "analytics.export.row_projected",
          exportId,
          details: {
            aggregateId: row.aggregateId,
            requester: row.requester,
            policy: row.requester === "Anonymous" ? "anonymous" : "redacted",
          },
        });
      }
      await this.repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.export.completed",
        exportId,
        details: { rowCount: result.rows.length },
      });
      await this.repository.appendOutbox({
        eventType: "analytics.export.completed",
        aggregateType: "export",
        aggregateId: exportId,
        payload: { rowCount: result.rows.length },
        idempotencyKey: `analytics.export.completed:${exportId}`,
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
      await this.repository.appendOutbox({
        eventType: "analytics.export.failed",
        aggregateType: "export",
        aggregateId: exportId,
        payload: {
          code: error instanceof Error ? error.message : "EXPORT_FAILED",
        },
        idempotencyKey: `analytics.export.failed:${exportId}`,
      });
      throw error;
    }
  }

  async markDownloaded(actor: ActorContext, exportId: string): Promise<void> {
    if (!canExport(actor)) {
      await this.recordLifecycle(actor, exportId, "denied", {
        reason: "ANALYTICS_EXPORT_FORBIDDEN",
      });
      throw new Error("ANALYTICS_EXPORT_FORBIDDEN");
    }
    const job = await this.repository.findExportJob(exportId);
    const operator = hasPermission(actor, PERMISSIONS.ANALYTICS_EXPORT_MANAGE);
    if (
      job === null ||
      (!operator && job.requestedByEmployeeId !== actor.employeeId)
    ) {
      await this.recordLifecycle(actor, exportId, "denied", {
        reason: "ANALYTICS_EXPORT_NOT_FOUND",
      });
      throw new Error("ANALYTICS_EXPORT_NOT_FOUND");
    }
    await this.repository.withTransaction((repository) =>
      new AnalyticsExportService(repository).markDownloadedInTransaction(
        actor,
        exportId,
      ),
    );
  }

  private async markDownloadedInTransaction(
    actor: ActorContext,
    exportId: string,
  ): Promise<void> {
    await this.repository.recordAudit({
      actorEmployeeId: actor.employeeId,
      action: "analytics.export.downloaded",
      exportId,
      details: {},
    });
    await this.repository.appendOutbox({
      eventType: "analytics.export.downloaded",
      aggregateType: "export",
      aggregateId: exportId,
      payload: {},
      idempotencyKey: `analytics.export.downloaded:${exportId}:${actor.sessionId}`,
    });
  }

  private async recordLifecycle(
    actor: ActorContext,
    exportId: string,
    state: "denied",
    details: unknown,
  ): Promise<void> {
    await this.repository.recordAudit({
      actorEmployeeId: actor.employeeId,
      action: `analytics.export.${state}`,
      exportId: exportId || actor.sessionId,
      details,
    });
    await this.repository.appendOutbox({
      eventType: `analytics.export.${state}`,
      aggregateType: "export",
      aggregateId: exportId || actor.sessionId,
      payload: details,
      idempotencyKey: `analytics.export.${state}:${actor.sessionId}:${exportId || "request"}:${Date.now()}`,
    });
  }
}
