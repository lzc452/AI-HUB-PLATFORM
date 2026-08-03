import {
  validateBehaviorEventInput,
  type ActorContext,
  type BehaviorEventInput,
} from "@ai-hub/contracts";
import type { AnalyticsEventRepository } from "./analytics.types.js";

const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export class AnalyticsEventService {
  constructor(private readonly repository: AnalyticsEventRepository) {}

  async record(
    actor: ActorContext | null,
    input: BehaviorEventInput,
  ): Promise<{ inserted: boolean }> {
    const validation = validateBehaviorEventInput(input);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }
    const occurredAt = new Date(input.occurredAt);
    const persisted = {
      eventName: input.eventName,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      actorEmployeeId: actor?.employeeId ?? null,
      audienceDepartmentId: actor?.primaryDepartmentId ?? null,
      audienceEmployeeId: null,
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey,
      occurredAt,
      expiresAt: new Date(occurredAt.getTime() + RETENTION_MS),
    };

    return this.repository.withTransaction(async (repository) => {
      const inserted = await repository.recordBehaviorEvent(persisted);
      if (!inserted) {
        return { inserted: false };
      }
      await repository.recordAuditEvent({
        actorEmployeeId: actor?.employeeId ?? null,
        action: "analytics.behavior_event.recorded",
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        details: {
          eventName: input.eventName,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await repository.appendOutboxEvent({
        eventType: "analytics.behavior_event.recorded",
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: {
          eventName: input.eventName,
          occurredAt: input.occurredAt,
        },
        idempotencyKey: `analytics:${input.idempotencyKey}`,
      });
      return { inserted: true };
    });
  }
}
