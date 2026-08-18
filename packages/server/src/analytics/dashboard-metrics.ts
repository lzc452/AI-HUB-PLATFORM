import type { DashboardKey } from "./dashboard.types.js";

export const dashboardMetricKeys: Readonly<
  Record<DashboardKey, readonly string[]>
> = {
  platform: [
    "platform.application_views",
    "platform.active_employee_count",
    "platform.active_application_count",
    "platform.delivery_action_count",
    "platform.published_application_count",
    "platform.pending_review_count",
    "platform.pending_claim_count",
    "demand.converted_count",
    "risk.high_risk_application_count",
  ],
  market: ["market.application_deliveries"],
  application: [
    "application.downloads",
    "application.likes",
    "application.comments",
    "application.ratings",
  ],
  innovation: ["innovation.demand_views"],
  review: ["review.decisions", "review.sla_breaches"],
  department: ["department.demand_views"],
  risk: [
    "risk.reported_interactions",
    "risk.feedback_submissions",
    "risk.feedback_resolutions",
  ],
  runtime: ["runtime.notification_queued", "runtime.notification_retries"],
  integration: [
    "integration.assistant_requests",
    "integration.assistant_failures",
  ],
  demand_value: [
    "demand.converted_count",
    "demand.converted_rate",
    "demand.avg_priority_score",
    "demand.pilot_completed_count",
  ],
};

export const exportMetricKeys: Readonly<Record<DashboardKey, string>> =
  Object.fromEntries(
    Object.entries(dashboardMetricKeys).map(([key, metricKeys]) => [
      key,
      metricKeys[0],
    ]),
  ) as Record<DashboardKey, string>;
