import type { DatabaseSchema } from "@ai-hub/database";
import { OutboxStore } from "@ai-hub/database";
import { type Kysely } from "kysely";
import type {
  AnalyticsAuditRecord,
  AnalyticsEventRepository,
  PersistedBehaviorEvent,
} from "./analytics.types.js";

export class KyselyAnalyticsEventRepository
  implements AnalyticsEventRepository
{
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: AnalyticsEventRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyAnalyticsEventRepository(transaction)),
      );
  }

  async recordBehaviorEvent(input: PersistedBehaviorEvent): Promise<boolean> {
    const row = await this.db
      .insertInto("analytics_behavior_events")
      .values({
        event_name: input.eventName,
        aggregate_type: input.aggregateType,
        aggregate_id: input.aggregateId,
        actor_employee_id: input.actorEmployeeId,
        audience_department_id: input.audienceDepartmentId,
        audience_employee_id: input.audienceEmployeeId,
        metadata: input.metadata,
        idempotency_key: input.idempotencyKey,
        occurred_at: input.occurredAt,
        expires_at: input.expiresAt,
      })
      .onConflict((conflict) => conflict.column("idempotency_key").doNothing())
      .returning("event_id")
      .executeTakeFirst();
    return row !== undefined;
  }

  async recordAuditEvent(input: AnalyticsAuditRecord): Promise<void> {
    await this.db
      .insertInto("analytics_audit_events")
      .values({
        actor_employee_id: input.actorEmployeeId,
        action: input.action,
        aggregate_type: input.aggregateType,
        aggregate_id: input.aggregateId,
        details: input.details,
      })
      .execute();
  }

  appendOutboxEvent(
    input: Parameters<OutboxStore["append"]>[0],
  ): Promise<boolean> {
    return new OutboxStore(this.db).append(input);
  }
}
