import type { DatabaseSchema } from "@ai-hub/database";
import { OutboxStore } from "@ai-hub/database";
import { type Kysely } from "kysely";
import type { DailyAggregate } from "./aggregation.types.js";
import type {
  AnalyticsDashboardRepository,
  DashboardReadInput,
} from "./dashboard.types.js";

export class KyselyAnalyticsDashboardRepository
  implements AnalyticsDashboardRepository
{
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: AnalyticsDashboardRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyAnalyticsDashboardRepository(transaction)),
      );
  }

  async readDailyAggregates(
    input: DashboardReadInput,
  ): Promise<readonly DailyAggregate[]> {
    let query = this.db
      .selectFrom("analytics_daily_aggregates")
      .selectAll()
      .where("metric_key", "in", input.metricKeys)
      .where("day", ">=", input.from)
      .where("day", "<", input.to);
    if (input.audienceScopeKey !== null) {
      query = query.where("audience_scope_key", "=", input.audienceScopeKey);
    }
    const rows = await query
      .orderBy("metric_key")
      .orderBy("day")
      .orderBy("audience_scope_key")
      .execute();
    return rows.map((row) => ({
      metricKey: row.metric_key,
      day: row.day,
      audienceScopeKey: row.audience_scope_key,
      value: Number(row.value),
      sourceEventCount: row.source_event_count,
    }));
  }

  async recordAudit(input: {
    actorEmployeeId: string;
    action: string;
    aggregateId: string;
    details: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("analytics_audit_events")
      .values({
        actor_employee_id: input.actorEmployeeId,
        action: input.action,
        aggregate_type: "dashboard",
        aggregate_id: input.aggregateId,
        details: input.details,
      })
      .execute();
  }

  appendOutbox(input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
    idempotencyKey: string;
  }): Promise<boolean> {
    return new OutboxStore(this.db).append(input);
  }
}
