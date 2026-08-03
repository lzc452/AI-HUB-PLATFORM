import type { BehaviorEventName } from "@ai-hub/contracts";

export interface RawBehaviorEvent {
  eventId: string;
  idempotencyKey: string;
  eventName: BehaviorEventName;
  occurredAt: Date;
  audienceScopeKey: string;
}

export interface DailyAggregate {
  metricKey: string;
  day: string;
  audienceScopeKey: string;
  value: number;
  sourceEventCount: number;
}

export interface AnalyticsMetricDefinition {
  metricKey: string;
  label: string;
  sourceEventNames: readonly BehaviorEventName[];
  formula: string;
  timeRange: "day" | "7d" | "30d" | "180d";
  requiredPermission: string;
  audienceRule: string;
  recompute: string;
}

export interface AnalyticsAggregationRepository {
  listRawEvents(from: Date, to: Date): Promise<readonly RawBehaviorEvent[]>;
  replaceDailyAggregates(rows: readonly DailyAggregate[]): Promise<void>;
}
