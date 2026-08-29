import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { setSession } from "../../modules/auth/session.store";

describe("数据看板页面", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/console/analytics");
    setSession({ employeeId: "E0001" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.includes("/internal/identity/actor")) {
          return Response.json({
            departmentIds: ["dept-1"],
            employeeId: "E0001",
            permissions: ["*"],
            primaryDepartmentId: "dept-1",
            roleCodes: ["employee", "super_admin"],
          });
        }
        if (path.includes("/internal/notifications/summary")) {
          return Response.json({ unreadCount: 0 });
        }
        if (path.includes("/internal/notifications")) {
          return Response.json([]);
        }
        if (path.includes("/internal/analytics/dashboards/")) {
          return Response.json({
            dashboardKey: "platform",
            from: "2026-05-01",
            metrics: [
              {
                metricKey: "platform.active_employee_count",
                day: "2026-05-31",
                audienceScopeKey: "all",
                value: 285,
                sourceEventCount: 285,
              },
            ],
            to: "2026-06-01",
          });
        }
        if (path.includes("/internal/analytics/platform-overview")) {
          return Response.json({
            alerts: [],
            appRanking: [
              { iconColor: "#1677ff", name: "智能合同审查", value: 1248 },
            ],
            conversionRates: [{ direction: "up", rate: 70.2, stage: "待认领" }],
            deliveryTrend: [{ date: "05-09", value: 34 }],
            departmentHeatmap: [
              { department: "财务部", usage: 186, week: "05-09~05-15" },
            ],
            demandFunnel: [{ count: 168, name: "待认领" }],
            kpiMetrics: [
              {
                iconBackground: "#e6f4ff",
                iconColor: "#1677ff",
                label: "月活员工",
                trend: { direction: "up", value: 12.6 },
                value: 285,
              },
            ],
            slaPolicies: [
              {
                name: "应用上架审核",
                overdue: 0,
                passRate: 98.7,
                pending: 3,
                trend: { direction: "up", value: 1.2 },
              },
            ],
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSession(null);
  });

  it("渲染平台总览 Tab 与核心指标", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "数据看板" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("平台总览")).toBeInTheDocument();
    expect(await screen.findByText("月活员工")).toBeInTheDocument();
    expect(await screen.findByText("285")).toBeInTheDocument();
  });
});
