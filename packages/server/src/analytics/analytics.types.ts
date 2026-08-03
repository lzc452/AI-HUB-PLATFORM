import type { BehaviorEventInput, OutboxEventInput } from "@ai-hub/contracts";

export interface PersistedBehaviorEvent {
  eventName: BehaviorEventInput["eventName"];
  aggregateType: BehaviorEventInput["aggregateType"];
  aggregateId: string;
  actorEmployeeId: string | null;
  audienceDepartmentId: string | null;
  audienceEmployeeId: string | null;
  metadata: BehaviorEventInput["metadata"];
  idempotencyKey: string;
  occurredAt: Date;
  expiresAt: Date;
}

export interface AnalyticsAuditRecord {
  actorEmployeeId: string | null;
  action: string;
  aggregateType: string;
  aggregateId: string;
  details: unknown;
}

export interface AnalyticsEventRepository {
  withTransaction<T>(
    operation: (repository: AnalyticsEventRepository) => Promise<T>,
  ): Promise<T>;
  recordBehaviorEvent(input: PersistedBehaviorEvent): Promise<boolean>;
  recordAuditEvent(input: AnalyticsAuditRecord): Promise<void>;
  appendOutboxEvent(input: OutboxEventInput): Promise<boolean>;
}
