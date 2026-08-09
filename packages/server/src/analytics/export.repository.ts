import { OutboxStore, type DatabaseSchema } from "@ai-hub/database";
import { type Kysely } from "kysely";
import type {
  AnalyticsExportAudit,
  AnalyticsExportReadInput,
  AnalyticsExportRepository,
  AnalyticsExportRow,
} from "./export.types.js";
import { exportMetricKeys } from "./dashboard-metrics.js";
import { hasPermission, PERMISSIONS } from "@ai-hub/contracts";

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
    const unrestricted = hasPermission(
      input.actor,
      PERMISSIONS.ANALYTICS_SCOPE_ALL,
    );
    let query = this.db
      .selectFrom("analytics_daily_aggregates")
      .select(["metric_key", "day", "audience_scope_key", "value"])
      .where("metric_key", "=", exportMetricKeys[input.request.target])
      .where("metric_version", "=", 1)
      .where("day", ">=", input.request.from)
      .where("day", "<", input.request.to);
    if (!unrestricted) {
      query = query.where(
        "audience_scope_key",
        "in",
        input.audienceScopeKeys ?? [
          `department:${input.actor.primaryDepartmentId}`,
        ],
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

  async findExportJob(exportId: string) {
    const row = await this.db
      .selectFrom("analytics_export_jobs")
      .select(["export_id", "requested_by_employee_id"])
      .where("export_id", "=", exportId)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          exportId: row.export_id,
          requestedByEmployeeId: row.requested_by_employee_id,
        };
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

  appendOutbox(input: Parameters<OutboxStore["append"]>[0]): Promise<boolean> {
    return new OutboxStore(this.db).append(input);
  }
}
