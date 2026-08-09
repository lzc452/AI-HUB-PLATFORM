import type { BehaviorEventName } from "@ai-hub/contracts";
import type { AnalyticsMetricDefinition } from "./aggregation.types.js";

const count = (
  metricKey: string,
  label: string,
  sourceEventNames: readonly BehaviorEventName[],
  requiredPermission: string,
  audienceRule: string,
): AnalyticsMetricDefinition => ({
  metricKey,
  version: 1,
  label,
  sourceEventNames,
  formula:
    "count(distinct idempotency_key) grouped by UTC day and audience scope",
  timeRange: "180d",
  requiredPermission,
  audienceRule,
  recompute:
    "Read retained raw events for the requested range and replace matching daily rows.",
});

export const metricDefinitions: readonly AnalyticsMetricDefinition[] = [
  count(
    "platform.application_views",
    "Application views",
    ["application_viewed"],
    "analytics.platform.read",
    "all authorized employees",
  ),
  count(
    "market.application_deliveries",
    "Application deliveries",
    ["application_delivered"],
    "analytics.market.read",
    "published application audience",
  ),
  count(
    "application.downloads",
    "Application downloads",
    ["application_downloaded"],
    "analytics.application.read",
    "application audience without access-list detail",
  ),
  count(
    "innovation.demand_views",
    "Demand views",
    ["demand_viewed"],
    "analytics.innovation.read",
    "demand audience predicates",
  ),
  count(
    "review.decisions",
    "Review decisions",
    ["review_decided"],
    "analytics.review.read",
    "review operator scope",
  ),
  count(
    "review.sla_breaches",
    "Review SLA breaches",
    ["review_sla_breached"],
    "analytics.review.read",
    "review operator scope",
  ),
  count(
    "department.demand_views",
    "Department demand views",
    ["demand_viewed"],
    "analytics.department.read",
    "actor department scope only",
  ),
  count(
    "risk.reported_interactions",
    "Reported interactions",
    ["demand_reported"],
    "analytics.risk.read",
    "risk operator scope without identity projection",
  ),
  count(
    "runtime.notification_retries",
    "Notification delivery retries",
    ["notification_delivery_retried"],
    "analytics.runtime.read",
    "aggregate delivery status only",
  ),
  count(
    "runtime.notification_queued",
    "Queued notifications",
    ["notification_queued"],
    "analytics.runtime.read",
    "aggregate delivery status only",
  ),
  count(
    "integration.assistant_requests",
    "Assistant requests",
    ["assistant_requested"],
    "analytics.integration.read",
    "authorized assistant aggregate scope",
  ),
  count(
    "integration.assistant_failures",
    "Assistant failures",
    ["assistant_failed"],
    "analytics.integration.read",
    "authorized assistant aggregate scope",
  ),
];
