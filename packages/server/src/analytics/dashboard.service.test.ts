import { describe, expect, it } from "vitest";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import { AnalyticsDashboardService } from "./dashboard.service.js";
import type {
  AnalyticsDashboardRepository,
  DashboardKey,
} from "./dashboard.types.js";

const actor = (roleCodes: readonly string[]): ActorContext => ({
  employeeId: "employee-1",
  roleCodes,
  permissions: roleCodes.flatMap((role) => {
    if (role === "analytics_operator") {
      return [
        PERMISSIONS.ANALYTICS_PLATFORM_READ,
        PERMISSIONS.ANALYTICS_SCOPE_ALL,
      ];
    }
    if (role === "analytics_department_reader") {
      return [PERMISSIONS.ANALYTICS_DEPARTMENT_READ];
    }
    return [];
  }),
  departmentIds: ["department-1"],
  primaryDepartmentId: "department-1",
  sessionId: "session-1",
});

describe("AnalyticsDashboardService", () => {
  it("returns only fixed dashboard metrics from daily aggregates", async () => {
    const calls: { key: DashboardKey; scope: string | null }[] = [];
    const audits: string[] = [];
    const repository: AnalyticsDashboardRepository = {
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
      withTransaction: async (operation) => operation(repository),
      recordAudit: async (input) => {
        audits.push(input.action);
      },
      appendOutbox: async () => true,
    };

    const result = await new AnalyticsDashboardService(repository).read(
      actor(["analytics_operator"]),
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
    const repository: AnalyticsDashboardRepository = {
      readDailyAggregates: async () => {
        queried = true;
        return [];
      },
      withTransaction: async (operation) => operation(repository),
      recordAudit: async () => undefined,
      appendOutbox: async () => true,
    };

    await expect(
      new AnalyticsDashboardService(repository).read(
        actor(["application_owner"]),
        "platform",
        "2026-08-03",
        "2026-08-04",
      ),
    ).rejects.toThrow("ANALYTICS_DASHBOARD_FORBIDDEN");
    expect(queried).toBe(false);
  });

  it("scopes department dashboard reads to the actor department", async () => {
    let scope: string | null | undefined;
    const repository: AnalyticsDashboardRepository = {
      readDailyAggregates: async (input) => {
        scope = input.audienceScopeKey;
        return [];
      },
      withTransaction: async (operation) => operation(repository),
      recordAudit: async () => undefined,
      appendOutbox: async () => true,
    };

    await new AnalyticsDashboardService(repository).read(
      actor(["analytics_department_reader"]),
      "department",
      "2026-08-03",
      "2026-08-04",
    );
    expect(scope).toBe("department:department-1");
  });
});
