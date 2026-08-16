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

export interface AnalyticsDateRange {
  from: string;
  to: string;
}

export function getDashboard(
  dashboardKey: DashboardKey,
  range?: AnalyticsDateRange,
): Promise<DashboardResult> {
  const query = range ? `?from=${range.from}&to=${range.to}` : "";
  return apiFetch<DashboardResult>(
    `/internal/analytics/dashboards/${encodeURIComponent(dashboardKey)}${query}`,
  );
}

export interface AnalyticsExportResult {
  exportId: string;
  target: DashboardKey;
  from: string;
  to: string;
  rows: Array<{
    aggregateId: string;
    occurredAt: string;
    requester?: string | null;
    value: number;
  }>;
}

export function createAnalyticsExport(
  target: DashboardKey,
  range: AnalyticsDateRange,
): Promise<AnalyticsExportResult> {
  return apiFetch<AnalyticsExportResult>("/internal/analytics/exports", {
    body: JSON.stringify({ target, ...range }),
    method: "POST",
  });
}
