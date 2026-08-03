import { describe, expect, it } from "vitest";
import { AnalyticsDashboardService } from "./dashboard.service.js";
import type { AnalyticsDashboardRepository } from "./dashboard.types.js";

describe("fixed analytics dashboard matrix", () => {
  it("exposes governance, department, risk, runtime, and integration keys with metric rules", () => {
    const repository: AnalyticsDashboardRepository = {
      readDailyAggregates: async () => [],
    };
    const service = new AnalyticsDashboardService(repository);
    expect(service.listFixedDashboards()).toEqual([
      "platform",
      "market",
      "application",
      "innovation",
      "review",
      "department",
      "risk",
      "runtime",
      "integration",
    ]);
    expect(
      service
        .getMetricDictionary()
        .filter((metric) =>
          [
            "review.decisions",
            "department.demand_views",
            "risk.reported_interactions",
            "runtime.notification_queued",
            "integration.assistant_requests",
          ].includes(metric.metricKey),
        )
        .every(
          (metric) =>
            metric.sourceEventNames.length > 0 &&
            metric.formula.length > 0 &&
            metric.requiredPermission.length > 0 &&
            metric.audienceRule.length > 0 &&
            metric.recompute.length > 0,
        ),
    ).toBe(true);
  });
});
