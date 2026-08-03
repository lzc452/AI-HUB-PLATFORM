import type { DatabaseSchema } from "@ai-hub/database";
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
}
