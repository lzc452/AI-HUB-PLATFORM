import type { ActorContext } from "@ai-hub/contracts";
import { metricDefinitions } from "./metric-dictionary.js";
import type {
  AnalyticsDashboardRepository,
  DashboardKey,
  DashboardResult,
} from "./dashboard.types.js";
import { dashboardMetricKeys } from "./dashboard-metrics.js";
import { assertAnalyticsRange } from "./range.js";

const dashboardRoles: Readonly<Record<DashboardKey, readonly string[]>> = {
  platform: ["analytics_operator", "analytics_platform_reader", "super_admin"],
  market: ["analytics_operator", "analytics_market_reader", "super_admin"],
  application: [
    "analytics_operator",
    "analytics_application_reader",
    "super_admin",
  ],
  innovation: [
    "analytics_operator",
    "analytics_innovation_reader",
    "demand_operator",
    "super_admin",
  ],
  review: [
    "analytics_operator",
    "analytics_review_reader",
    "demand_reviewer",
    "super_admin",
  ],
  department: [
    "analytics_operator",
    "analytics_department_reader",
    "department_lead",
    "super_admin",
  ],
  risk: [
    "analytics_operator",
    "analytics_risk_reader",
    "risk_operator",
    "super_admin",
  ],
  runtime: ["analytics_operator", "analytics_runtime_reader", "super_admin"],
  integration: [
    "analytics_operator",
    "analytics_integration_reader",
    "super_admin",
  ],
};

export class AnalyticsDashboardService {
  constructor(private readonly repository: AnalyticsDashboardRepository) {}

  listFixedDashboards(): readonly DashboardKey[] {
    return Object.keys(dashboardMetricKeys) as DashboardKey[];
  }

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
    assertAnalyticsRange(from, to);
    const unrestricted = ["analytics_operator", "super_admin"].some((role) =>
      actor.roleCodes.includes(role),
    );
    return this.repository.withTransaction(async (repository) => {
      const metrics = dashboardMetricKeys[dashboardKey];
      const result = await repository.readDailyAggregates({
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
      const dashboardResult = {
        dashboardKey,
        from,
        to,
        metrics: result.filter((row) => allowed.has(row.metricKey)),
      };
      const aggregateId = `${dashboardKey}:${from}:${to}`;
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.dashboard.read",
        aggregateId,
        details: {
          dashboardKey,
          from,
          to,
          metricKeys: metrics,
          rowCount: dashboardResult.metrics.length,
        },
      });
      await repository.appendOutbox({
        eventType: "analytics.dashboard.read",
        aggregateType: "dashboard",
        aggregateId,
        payload: { dashboardKey, from, to },
        idempotencyKey: `analytics.dashboard.read:${actor.sessionId}:${aggregateId}`,
      });
      return dashboardResult;
    });
  }

  getMetricDictionary() {
    return metricDefinitions;
  }
}
