import type { BehaviorEventName } from "@ai-hub/contracts";

export interface RawBehaviorEvent {
  eventId: string;
  idempotencyKey: string;
  eventName: BehaviorEventName;
  aggregateId: string;
  actorEmployeeId: string | null;
  occurredAt: Date;
  audienceScopeKey: string;
}

export interface DailyAggregate {
  metricKey: string;
  metricVersion?: number;
  day: string;
  audienceScopeKey: string;
  value: number;
  sourceEventCount: number;
}

export interface AnalyticsMetricDefinition {
  metricKey: string;
  version: number;
  label: string;
  sourceEventNames: readonly BehaviorEventName[];
  aggregation: "count" | "distinct_actor" | "distinct_aggregate" | "snapshot";
  formula: string;
  timeRange: "day" | "7d" | "30d" | "180d";
  requiredPermission: string;
  audienceRule: string;
  recompute: string;
}

export interface AnalyticsAggregationRepository {
  listRawEvents(from: Date, to: Date): Promise<readonly RawBehaviorEvent[]>;
  replaceDailyAggregates(
    rows: readonly DailyAggregate[],
    from?: Date,
    to?: Date,
  ): Promise<void>;
}
