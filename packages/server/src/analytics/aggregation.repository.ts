import type { DatabaseSchema } from "@ai-hub/database";
import { type Kysely, type Selectable } from "kysely";
import type {
  AnalyticsAggregationRepository,
  DailyAggregate,
  RawBehaviorEvent,
} from "./aggregation.types.js";

type EventRow = Selectable<DatabaseSchema["analytics_behavior_events"]>;

export class KyselyAnalyticsAggregationRepository
  implements AnalyticsAggregationRepository
{
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listRawEvents(
    from: Date,
    to: Date,
  ): Promise<readonly RawBehaviorEvent[]> {
    const rows = await this.db
      .selectFrom("analytics_behavior_events")
      .selectAll()
      .where("occurred_at", ">=", from)
      .where("occurred_at", "<", to)
      .where("expires_at", ">", new Date())
      .orderBy("occurred_at", "asc")
      .execute();
    return rows.map((row: EventRow) => ({
      eventId: row.event_id,
      idempotencyKey: row.idempotency_key,
      eventName: row.event_name as RawBehaviorEvent["eventName"],
      occurredAt: row.occurred_at,
      audienceScopeKey:
        row.audience_employee_id !== null
          ? `employee:${row.audience_employee_id}`
          : row.audience_department_id !== null
            ? `department:${row.audience_department_id}`
            : "all",
    }));
  }

  async replaceDailyAggregates(
    rows: readonly DailyAggregate[],
    from?: Date,
    to?: Date,
  ): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      if (from !== undefined && to !== undefined) {
        await transaction
          .deleteFrom("analytics_daily_aggregates")
          .where("day", ">=", from.toISOString().slice(0, 10))
          .where("day", "<", to.toISOString().slice(0, 10))
          .execute();
      }
      for (const row of rows) {
        await transaction
          .insertInto("analytics_daily_aggregates")
          .values({
            metric_key: row.metricKey,
            metric_version: row.metricVersion ?? 1,
            day: row.day,
            audience_scope_key: row.audienceScopeKey,
            value: row.value,
            source_event_count: row.sourceEventCount,
            computed_at: new Date(),
          })
          .onConflict((conflict) =>
            conflict
              .columns(["metric_key", "day", "audience_scope_key"])
              .doUpdateSet({
                metric_version: row.metricVersion ?? 1,
                value: row.value,
                source_event_count: row.sourceEventCount,
                computed_at: new Date(),
              }),
          )
          .execute();
      }
    });
  }
}
