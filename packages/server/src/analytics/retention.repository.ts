import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import type { AnalyticsRetentionRepository } from "./retention.types.js";

export class KyselyAnalyticsRetentionRepository
  implements AnalyticsRetentionRepository
{
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: AnalyticsRetentionRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyAnalyticsRetentionRepository(transaction)),
      );
  }

  async purgeExpiredEvents(now: Date): Promise<number> {
    await sql`select set_config('app.analytics_retention_job', 'on', true)`.execute(
      this.db,
    );
    const deleted = await this.db
      .deleteFrom("analytics_behavior_events")
      .where("expires_at", "<=", now)
      .returning("event_id")
      .execute();
    return deleted.length;
  }

  async recordAudit(input: {
    action: string;
    aggregateId: string;
    details: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("analytics_audit_events")
      .values({
        actor_employee_id: null,
        action: input.action,
        aggregate_type: "retention",
        aggregate_id: input.aggregateId,
        details: input.details,
      })
      .execute();
  }
}
