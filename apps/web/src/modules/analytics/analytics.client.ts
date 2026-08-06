import { apiFetch } from "../../shared/api/client";

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

export interface DailyAggregate {
  metricKey: string;
  metricVersion?: number;
  day: string;
  audienceScopeKey: string;
  value: number;
  sourceEventCount: number;
}

export interface DashboardResult {
  dashboardKey: DashboardKey;
  from: string;
  to: string;
  metrics: DailyAggregate[];
}

export function getDashboard(
  dashboardKey: DashboardKey,
): Promise<DashboardResult> {
  return apiFetch<DashboardResult>(
    `/internal/analytics/dashboards/${encodeURIComponent(dashboardKey)}`,
  );
}
