import type { DashboardKey } from "./dashboard.types.js";

export const dashboardMetricKeys: Readonly<
  Record<DashboardKey, readonly string[]>
> = {
  platform: ["platform.application_views"],
  market: ["market.application_deliveries"],
  application: ["application.downloads"],
  innovation: ["innovation.demand_views"],
  review: ["review.decisions", "review.sla_breaches"],
  department: ["department.demand_views"],
  risk: ["risk.reported_interactions"],
  runtime: ["runtime.notification_queued", "runtime.notification_retries"],
  integration: [
    "integration.assistant_requests",
    "integration.assistant_failures",
  ],
};

export const exportMetricKeys: Readonly<Record<DashboardKey, string>> =
  Object.fromEntries(
    Object.entries(dashboardMetricKeys).map(([key, metricKeys]) => [
      key,
      metricKeys[0],
    ]),
  ) as Record<DashboardKey, string>;
