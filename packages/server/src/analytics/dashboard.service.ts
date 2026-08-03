import type { ActorContext } from "@ai-hub/contracts";
import { metricDefinitions } from "./metric-dictionary.js";
import type {
  AnalyticsDashboardRepository,
  DashboardKey,
  DashboardResult,
} from "./dashboard.types.js";

const dashboardMetrics: Readonly<Record<DashboardKey, readonly string[]>> = {
  platform: ["platform.application_views"],
  market: ["market.application_deliveries"],
  application: ["application.downloads"],
  innovation: ["innovation.demand_views"],
  review: ["review.decisions"],
  department: ["department.demand_views"],
  risk: ["risk.reported_interactions"],
  runtime: ["runtime.notification_queued"],
  integration: ["integration.assistant_requests"],
};

const dashboardRoles: Readonly<Record<DashboardKey, readonly string[]>> = {
  platform: ["analytics_operator", "analytics_platform_reader", "super_admin"],
  market: ["analytics_operator", "analytics_market_reader", "super_admin"],
  application: ["analytics_operator", "analytics_application_reader", "super_admin"],
  innovation: ["analytics_operator", "analytics_innovation_reader", "demand_operator", "super_admin"],
  review: ["analytics_operator", "analytics_review_reader", "demand_reviewer", "super_admin"],
  department: ["analytics_operator", "analytics_department_reader", "department_lead", "super_admin"],
  risk: ["analytics_operator", "analytics_risk_reader", "risk_operator", "super_admin"],
  runtime: ["analytics_operator", "analytics_runtime_reader", "super_admin"],
  integration: ["analytics_operator", "analytics_integration_reader", "super_admin"],
};

export class AnalyticsDashboardService {
  constructor(private readonly repository: AnalyticsDashboardRepository) {}

  async read(
    actor: ActorContext,
    dashboardKey: DashboardKey,
    from: string,
    to: string,
  ): Promise<DashboardResult> {
    const roles = dashboardRoles[dashboardKey];
    if (!roles.some((role) => actor.roleCodes.includes(role))) {
      throw new Error("ANALYTICS_DASHBOARD_FORBIDDEN");
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate >= toDate ||
      toDate.getTime() - fromDate.getTime() > 180 * 24 * 60 * 60 * 1000
    ) {
      throw new Error("ANALYTICS_RANGE_INVALID");
    }
    const unrestricted = ["analytics_operator", "super_admin"].some((role) =>
      actor.roleCodes.includes(role),
    );
    const metrics = dashboardMetrics[dashboardKey];
    const result = await this.repository.readDailyAggregates({
      actor,
      dashboardKey,
      metricKeys: metrics,
      from,
      to,
      audienceScopeKey: unrestricted
        ? null
        : `department:${actor.primaryDepartmentId}`,
    });
    const allowed = new Set(metrics);
    return {
      dashboardKey,
      from,
      to,
      metrics: result.filter((row) => allowed.has(row.metricKey)),
    };
  }

  getMetricDictionary() {
    return metricDefinitions;
  }
}
