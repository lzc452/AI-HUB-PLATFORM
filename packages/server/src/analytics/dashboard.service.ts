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
  // 需求价值看板复用创新分析权限：demand_operator 角色已持有
  // ANALYTICS_INNOVATION_READ，无需新增 analytics.demand.read 权限。
  demand_value: PERMISSIONS.ANALYTICS_INNOVATION_READ,
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
    applicationId?: string,
  ): Promise<DashboardResult> {
    const permission = dashboardPermissions[dashboardKey];
    const hasDashboardPermission = hasPermission(actor, permission);
    if (!hasDashboardPermission && applicationId === undefined) {
      throw new Error("ANALYTICS_DASHBOARD_FORBIDDEN");
    }
    assertAnalyticsRange(from, to);
    const unrestricted = hasPermission(actor, PERMISSIONS.ANALYTICS_SCOPE_ALL);
    return this.repository.withTransaction(async (repository) => {
      const metrics = dashboardMetricKeys[dashboardKey];
      const scopeInput = unrestricted
        ? { audienceScopeKey: null as string | null }
        : {
            audienceScopeKey: `department:${actor.primaryDepartmentId}`,
            audienceScopeKeys: [
              `department:${actor.primaryDepartmentId}`,
              `employee:${actor.employeeId}`,
            ],
          };
      let result;
      if (applicationId !== undefined) {
        if (dashboardKey !== "application") {
          throw new Error("ANALYTICS_DASHBOARD_APPLICATION_SCOPE_INVALID");
        }
        if (!hasDashboardPermission) {
          const ownerOrMaintainer =
            await repository.isApplicationOwnerOrMaintainer(
              actor.employeeId,
              applicationId,
            );
          if (!ownerOrMaintainer) {
            throw new Error("ANALYTICS_DASHBOARD_FORBIDDEN");
          }
        }
        // 单应用维度不存在预聚合行，按应用 ID 从行为事件重聚合；
        // 数据范围即该应用本身，不再叠加部门/员工受众范围过滤。
        result = await repository.readApplicationDailyAggregates({
          actor,
          dashboardKey,
          metricKeys: metrics,
          from,
          to,
          audienceScopeKey: null,
          applicationId,
        });
      } else {
        result = await repository.readDailyAggregates({
          actor,
          dashboardKey,
          metricKeys: metrics,
          from,
          to,
          ...scopeInput,
        });
        if (dashboardKey === "demand_value") {
          const derived = await repository.readDemandValueAggregates({
            actor,
            dashboardKey,
            metricKeys: metrics,
            from,
            to,
            ...scopeInput,
          });
          result = [...result, ...derived];
        }
      }
      const allowed = new Set(metrics);
      // demand_value 的指标（demand.converted_count 等）由审计事件按日派生，
      // 与 readSnapshotCounts 的当前快照同 key，若合并会产生重复行导致 KPI 虚增。
      const snapshots =
        dashboardKey === "demand_value"
          ? []
          : (await repository.readSnapshotCounts())
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
      const aggregateId = `${dashboardKey}:${from}:${to}${
        applicationId === undefined ? "" : `:${applicationId}`
      }`;
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.dashboard.read",
        aggregateId,
        details: {
          dashboardKey,
          from,
          to,
          applicationId: applicationId ?? null,
          metricKeys: metrics,
          rowCount: dashboardResult.metrics.length,
        },
      });
      await repository.appendOutbox({
        eventType: "analytics.dashboard.read",
        aggregateType: "dashboard",
        aggregateId,
        payload: {
          dashboardKey,
          from,
          to,
          applicationId: applicationId ?? null,
        },
        idempotencyKey: `analytics.dashboard.read:${actor.sessionId}:${aggregateId}`,
      });
      return dashboardResult;
    });
  }

  getMetricDictionary() {
    return metricDefinitions;
  }
}
