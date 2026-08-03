import type { DatabaseSchema } from "@ai-hub/database";
import { type Kysely } from "kysely";
import type {
  AnalyticsExportAudit,
  AnalyticsExportReadInput,
  AnalyticsExportRepository,
  AnalyticsExportRow,
} from "./export.types.js";

const metricByTarget = {
  platform: "platform.application_views",
  market: "market.application_deliveries",
  application: "application.downloads",
  innovation: "innovation.demand_views",
  review: "review.decisions",
  department: "department.demand_views",
  risk: "risk.reported_interactions",
  runtime: "runtime.notification_queued",
  integration: "integration.assistant_requests",
} as const;

export class KyselyAnalyticsExportRepository
  implements AnalyticsExportRepository
{
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: AnalyticsExportRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyAnalyticsExportRepository(transaction)),
      );
  }

  async readVisibleRows(
    input: AnalyticsExportReadInput,
  ): Promise<readonly AnalyticsExportRow[]> {
    const unrestricted = ["analytics_operator", "super_admin"].some((role) =>
      input.actor.roleCodes.includes(role),
    );
    let query = this.db
      .selectFrom("analytics_daily_aggregates")
      .select(["metric_key", "day", "audience_scope_key", "value"])
      .where("metric_key", "=", metricByTarget[input.request.target])
      .where("day", ">=", input.request.from)
      .where("day", "<", input.request.to);
    if (!unrestricted) {
      query = query.where(
        "audience_scope_key",
        "=",
        `department:${input.actor.primaryDepartmentId}`,
      );
    }
    const rows = await query.orderBy("day").execute();
    return rows.map((row) => ({
      aggregateId: `${row.metric_key}:${row.day}:${row.audience_scope_key}`,
      occurredAt: `${row.day}T00:00:00.000Z`,
      value: Number(row.value),
      requesterEmployeeId: null,
      displayAnonymously: true,
    }));
  }

  async recordAudit(input: AnalyticsExportAudit): Promise<void> {
    await this.db
      .insertInto("analytics_audit_events")
      .values({
        actor_employee_id: input.actorEmployeeId,
        action: input.action,
        aggregate_type: "export",
        aggregate_id: input.exportId,
        details: input.details,
      })
      .execute();

    const details = input.details as {
      target?: string;
      from?: string;
      to?: string;
      rowCount?: number;
      code?: string;
    };
    if (input.action === "analytics.export.requested") {
      await this.db
        .insertInto("analytics_export_jobs")
        .values({
          export_id: input.exportId,
          requested_by_employee_id: input.actorEmployeeId,
          target: details.target ?? "unknown",
          from_date: details.from ?? "1970-01-01",
          to_date: details.to ?? "1970-01-02",
          status: "queued",
          failure_code: null,
          completed_at: null,
        })
        .execute();
    } else if (input.action === "analytics.export.completed") {
      await this.db
        .updateTable("analytics_export_jobs")
        .set({ status: "completed", completed_at: new Date() })
        .where("export_id", "=", input.exportId)
        .execute();
    } else if (input.action === "analytics.export.failed") {
      await this.db
        .updateTable("analytics_export_jobs")
        .set({
          status: "failed",
          failure_code: details.code ?? "EXPORT_FAILED",
        })
        .where("export_id", "=", input.exportId)
        .execute();
    }
  }
}
