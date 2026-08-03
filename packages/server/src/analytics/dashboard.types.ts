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
}

export interface AnalyticsDashboardRepository {
  readDailyAggregates(input: DashboardReadInput): Promise<readonly DailyAggregate[]>;
}

export interface DashboardResult {
  dashboardKey: DashboardKey;
  from: string;
  to: string;
  metrics: readonly DailyAggregate[];
}
