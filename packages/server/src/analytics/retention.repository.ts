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
    const result = await sql<{ deleted: number }>`
      select purge_analytics_behavior_events(${now}) as deleted
    `.execute(this.db);
    return Number(result.rows[0]?.deleted ?? 0);
  }

  async listOverdueReviewQueues(now: Date): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom("application_review_queue")
      .select("application_version_id")
      .where("sla_due_at", "<=", now)
      .execute();
    return rows.map((row) => row.application_version_id);
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
