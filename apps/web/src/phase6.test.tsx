import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./modules/analytics/useAnalytics", () => ({
  useDashboard: (dashboardKey: string) => ({
    data: { dashboardKey, from: "", metrics: [], to: "" },
    error: null,
    isError: false,
    isPending: false,
  }),
}));

vi.mock("./modules/analytics/usePlatformOverview", () => ({
  usePlatformOverview: () => ({
    data: {
      alerts: [],
      appRanking: [],
      conversionRates: [],
      deliveryTrend: [],
      departmentHeatmap: [],
      demandFunnel: [],
      kpiMetrics: [
        {
          iconBackground: "#e6f4ff",
          iconColor: "#1677ff",
          label: "月活员工",
          trend: { direction: "up", value: 12.6 },
          value: 285,
        },
      ],
      slaPolicies: [],
    },
    error: null,
    isError: false,
    isPending: false,
  }),
}));

describe("Phase 6 analytics dashboard shell", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/analytics");
  });

  it("shows tabbed dashboard with platform overview and time filter", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "数据看板" }),
    ).toBeInTheDocument();
    expect(screen.getByText("平台总览")).toBeInTheDocument();
    expect(screen.getByText("市场分析")).toBeInTheDocument();
    expect(screen.getByText("应用组合")).toBeInTheDocument();
    expect(screen.getByText("需求漏斗")).toBeInTheDocument();
    expect(screen.getByText("部门贡献")).toBeInTheDocument();
    expect(screen.getByText("风险治理")).toBeInTheDocument();
    expect(screen.getByText("近30天")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出" })).toBeInTheDocument();
    expect(screen.getByText("月活员工")).toBeInTheDocument();
  });
});
