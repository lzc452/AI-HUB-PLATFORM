import { describe, expect, it } from "vitest";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import { AnalyticsDashboardService } from "./dashboard.service.js";
import type {
  AnalyticsDashboardRepository,
  DashboardKey,
} from "./dashboard.types.js";

const actor = (
  permissions: readonly string[],
  overrides: Partial<ActorContext> = {},
): ActorContext => ({
  employeeId: "employee-1",
  roleCodes: [],
  permissions,
  departmentIds: ["department-1"],
  primaryDepartmentId: "department-1",
  sessionId: "session-1",
  ...overrides,
});

const analyticsOperator = (): ActorContext =>
  actor([
    PERMISSIONS.ANALYTICS_PLATFORM_READ,
    PERMISSIONS.ANALYTICS_APPLICATION_READ,
    PERMISSIONS.ANALYTICS_SCOPE_ALL,
  ]);

const demandOperator = (): ActorContext =>
  actor([PERMISSIONS.ANALYTICS_INNOVATION_READ]);

const departmentReader = (): ActorContext =>
  actor([PERMISSIONS.ANALYTICS_DEPARTMENT_READ]);

const repository = (
  overrides: Partial<AnalyticsDashboardRepository> = {},
): AnalyticsDashboardRepository => {
  const base: AnalyticsDashboardRepository = {
    readDailyAggregates: async () => [],
    readDemandValueAggregates: async () => [],
    readApplicationDailyAggregates: async () => [],
    readSnapshotCounts: async () => [],
    isApplicationOwnerOrMaintainer: async () => false,
    withTransaction: async (operation) => operation(base),
    recordAudit: async () => undefined,
    appendOutbox: async () => true,
    ...overrides,
  };
  return base;
};

describe("AnalyticsDashboardService", () => {
  it("returns only fixed dashboard metrics from daily aggregates", async () => {
    const calls: { key: DashboardKey; scope: string | null }[] = [];
    const audits: string[] = [];
    const repo = repository({
      readDailyAggregates: async (input) => {
        calls.push({ key: input.dashboardKey, scope: input.audienceScopeKey });
        return [
          {
            metricKey: "platform.application_views",
            day: "2026-08-03",
            audienceScopeKey: "all",
            value: 4,
            sourceEventCount: 4,
          },
        ];
      },
      recordAudit: async (input) => {
        audits.push(input.action);
      },
    });

    const result = await new AnalyticsDashboardService(repo).read(
      analyticsOperator(),
      "platform",
      "2026-08-03",
      "2026-08-04",
    );

    expect(result.dashboardKey).toBe("platform");
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]?.sourceEventCount).toBe(4);
    expect(calls).toEqual([{ key: "platform", scope: null }]);
    expect(audits).toEqual(["analytics.dashboard.read"]);
  });

  it("rejects unauthorized dashboards before querying aggregates", async () => {
    let queried = false;
    const repo = repository({
      readDailyAggregates: async () => {
        queried = true;
        return [];
      },
    });

    await expect(
      new AnalyticsDashboardService(repo).read(
        actor([]),
        "platform",
        "2026-08-03",
        "2026-08-04",
      ),
    ).rejects.toThrow("ANALYTICS_DASHBOARD_FORBIDDEN");
    expect(queried).toBe(false);
  });

  it("scopes department dashboard reads to the actor department", async () => {
    let scope: string | null | undefined;
    const repo = repository({
      readDailyAggregates: async (input) => {
        scope = input.audienceScopeKey;
        return [];
      },
    });

    await new AnalyticsDashboardService(repo).read(
      departmentReader(),
      "department",
      "2026-08-03",
      "2026-08-04",
    );
    expect(scope).toBe("department:department-1");
  });

  it("exposes the demand_value dashboard to demand operators with derived metrics", async () => {
    const derivedCalls: DashboardKey[] = [];
    const repo = repository({
      readDemandValueAggregates: async (input) => {
        derivedCalls.push(input.dashboardKey);
        expect(input.metricKeys).toEqual([
          "demand.converted_count",
          "demand.converted_rate",
          "demand.avg_priority_score",
          "demand.pilot_completed_count",
        ]);
        return [
          {
            metricKey: "demand.converted_count",
            day: "2026-08-03",
            audienceScopeKey: "department:department-1",
            value: 2,
            sourceEventCount: 2,
          },
        ];
      },
    });

    const service = new AnalyticsDashboardService(repo);
    const result = await service.read(
      demandOperator(),
      "demand_value",
      "2026-08-03",
      "2026-08-04",
    );

    expect(result.dashboardKey).toBe("demand_value");
    expect(result.metrics.map((metric) => metric.metricKey)).toContain(
      "demand.converted_count",
    );
    expect(service.listFixedDashboards()).toContain("demand_value");
    expect(derivedCalls).toEqual(["demand_value"]);
  });

  it("does not merge snapshot rows into the demand_value dashboard (no duplicated converted_count)", async () => {
    const repo = repository({
      readDemandValueAggregates: async () => [
        {
          metricKey: "demand.converted_count",
          day: "2026-08-03",
          audienceScopeKey: "all",
          value: 2,
          sourceEventCount: 2,
        },
      ],
      readSnapshotCounts: async () => [
        { metricKey: "demand.converted_count", value: 99 },
      ],
    });

    const result = await new AnalyticsDashboardService(repo).read(
      actor([
        PERMISSIONS.ANALYTICS_INNOVATION_READ,
        PERMISSIONS.ANALYTICS_SCOPE_ALL,
      ]),
      "demand_value",
      "2026-08-03",
      "2026-08-04",
    );

    const converted = result.metrics.filter(
      (metric) => metric.metricKey === "demand.converted_count",
    );
    expect(converted).toHaveLength(1);
    expect(converted[0]?.value).toBe(2);
  });

  it("forbids the demand_value dashboard without demand analytics permission", async () => {
    await expect(
      new AnalyticsDashboardService(repository()).read(
        actor([]),
        "demand_value",
        "2026-08-03",
        "2026-08-04",
      ),
    ).rejects.toThrow("ANALYTICS_DASHBOARD_FORBIDDEN");
  });

  it("allows an application owner to read the application dashboard scoped by applicationId", async () => {
    const owner = actor([], { employeeId: "employee-owner" });
    let scopedApplicationId: string | undefined;
    const repo = repository({
      isApplicationOwnerOrMaintainer: async (employeeId, applicationId) =>
        employeeId === "employee-owner" && applicationId === "app-1",
      readApplicationDailyAggregates: async (input) => {
        scopedApplicationId = input.applicationId;
        expect(input.metricKeys).toEqual([
          "application.downloads",
          "application.likes",
          "application.comments",
          "application.ratings",
        ]);
        return [
          {
            metricKey: "application.downloads",
            day: "2026-08-03",
            audienceScopeKey: "all",
            value: 1,
            sourceEventCount: 1,
          },
        ];
      },
    });

    const result = await new AnalyticsDashboardService(repo).read(
      owner,
      "application",
      "2026-08-03",
      "2026-08-04",
      "app-1",
    );

    expect(scopedApplicationId).toBe("app-1");
    expect(result.metrics.map((metric) => metric.metricKey)).toContain(
      "application.downloads",
    );
  });

  it("forbids application-scoped reads for non-owners without analytics permission", async () => {
    const repo = repository({
      isApplicationOwnerOrMaintainer: async () => false,
    });

    await expect(
      new AnalyticsDashboardService(repo).read(
        actor([]),
        "application",
        "2026-08-03",
        "2026-08-04",
        "app-1",
      ),
    ).rejects.toThrow("ANALYTICS_DASHBOARD_FORBIDDEN");
  });

  it("rejects applicationId on non-application dashboards", async () => {
    await expect(
      new AnalyticsDashboardService(repository()).read(
        analyticsOperator(),
        "platform",
        "2026-08-03",
        "2026-08-04",
        "app-1",
      ),
    ).rejects.toThrow("ANALYTICS_DASHBOARD_APPLICATION_SCOPE_INVALID");
  });

  it("includes demand conversion and high-risk application snapshots on the platform dashboard", async () => {
    const repo = repository({
      readSnapshotCounts: async () => [
        { metricKey: "platform.published_application_count", value: 3 },
        { metricKey: "platform.pending_review_count", value: 2 },
        { metricKey: "platform.pending_claim_count", value: 1 },
        { metricKey: "demand.converted_count", value: 5 },
        { metricKey: "risk.high_risk_application_count", value: 2 },
      ],
    });

    const result = await new AnalyticsDashboardService(repo).read(
      analyticsOperator(),
      "platform",
      "2026-08-03",
      "2026-08-04",
    );

    const keys = result.metrics.map((metric) => metric.metricKey);
    expect(keys).toContain("demand.converted_count");
    expect(keys).toContain("risk.high_risk_application_count");
  });
});
