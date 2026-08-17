import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
} from "@ai-hub/contracts";
import { metricDefinitions } from "./metric-dictionary.js";
import type {
  AnalyticsDashboardRepository,
  DashboardKey,
  DashboardResult,
} from "./dashboard.types.js";
import { dashboardMetricKeys } from "./dashboard-metrics.js";
import { assertAnalyticsRange } from "./range.js";

const dashboardPermissions: Readonly<Record<DashboardKey, string>> = {
  platform: PERMISSIONS.ANALYTICS_PLATFORM_READ,
  market: PERMISSIONS.ANALYTICS_MARKET_READ,
  application: PERMISSIONS.ANALYTICS_APPLICATION_READ,
  innovation: PERMISSIONS.ANALYTICS_INNOVATION_READ,
  review: PERMISSIONS.ANALYTICS_REVIEW_READ,
  department: PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
  risk: PERMISSIONS.ANALYTICS_RISK_READ,
  runtime: PERMISSIONS.ANALYTICS_RUNTIME_READ,
  integration: PERMISSIONS.ANALYTICS_INTEGRATION_READ,
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
    const permission = dashboardPermissions[dashboardKey];
    if (!hasPermission(actor, permission)) {
      throw new Error("ANALYTICS_DASHBOARD_FORBIDDEN");
    }
    assertAnalyticsRange(from, to);
    const unrestricted = hasPermission(actor, PERMISSIONS.ANALYTICS_SCOPE_ALL);
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
        ...(unrestricted
          ? {}
          : {
              audienceScopeKeys: [
                `department:${actor.primaryDepartmentId}`,
                `employee:${actor.employeeId}`,
              ],
            }),
      });
      const allowed = new Set(metrics);
      const snapshots = (await repository.readSnapshotCounts())
        .filter((snapshot) => allowed.has(snapshot.metricKey))
        .map((snapshot) => ({
          metricKey: snapshot.metricKey,
          metricVersion: 1,
          day: to,
          audienceScopeKey: "platform:snapshot",
          value: snapshot.value,
          sourceEventCount: 0,
        }));
      const dashboardResult = {
        dashboardKey,
        from,
        to,
        metrics: [
          ...result.filter((row) => allowed.has(row.metricKey)),
          ...snapshots,
        ],
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
