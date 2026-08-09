import { PERMISSIONS } from "@ai-hub/contracts";

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

export const DASHBOARD_PERMISSIONS: Record<
  DashboardKey,
  `analytics.${DashboardKey}.read`
> = {
  application: PERMISSIONS.ANALYTICS_APPLICATION_READ,
  department: PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
  innovation: PERMISSIONS.ANALYTICS_INNOVATION_READ,
  integration: PERMISSIONS.ANALYTICS_INTEGRATION_READ,
  market: PERMISSIONS.ANALYTICS_MARKET_READ,
  platform: PERMISSIONS.ANALYTICS_PLATFORM_READ,
  review: PERMISSIONS.ANALYTICS_REVIEW_READ,
  risk: PERMISSIONS.ANALYTICS_RISK_READ,
  runtime: PERMISSIONS.ANALYTICS_RUNTIME_READ,
};

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
