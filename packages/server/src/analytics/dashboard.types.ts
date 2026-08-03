import type { ActorContext } from "@ai-hub/contracts";
import type { DailyAggregate } from "./aggregation.types.js";

export type DashboardKey =
  | "platform"
  | "market"
  | "application"
  | "innovation"
  | "review"
  | "department"
  | "risk"
  | "runtime"
  | "integration";

export interface DashboardReadInput {
  actor: ActorContext;
  dashboardKey: DashboardKey;
  metricKeys: readonly string[];
  from: string;
  to: string;
  audienceScopeKey: string | null;
  audienceScopeKeys?: readonly string[];
}

export interface AnalyticsDashboardRepository {
  withTransaction<T>(
    operation: (repository: AnalyticsDashboardRepository) => Promise<T>,
  ): Promise<T>;
  readDailyAggregates(
    input: DashboardReadInput,
  ): Promise<readonly DailyAggregate[]>;
  recordAudit(input: {
    actorEmployeeId: string;
    action: string;
    aggregateId: string;
    details: unknown;
  }): Promise<void>;
  appendOutbox(input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
    idempotencyKey: string;
  }): Promise<boolean>;
}

export interface DashboardResult {
  dashboardKey: DashboardKey;
  from: string;
  to: string;
  metrics: readonly DailyAggregate[];
}
