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

describe("Phase 6 analytics dashboard shell", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/analytics");
  });

  it("shows fixed dashboard groups and the raw-event rebuild boundary", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "数据看板" }),
    ).toBeInTheDocument();
    expect(screen.getByText("平台总览")).toBeInTheDocument();
    expect(screen.getByText("市场采用分析")).toBeInTheDocument();
    expect(screen.getByText("应用组合分析")).toBeInTheDocument();
    expect(screen.getByText("创新需求漏斗")).toBeInTheDocument();
    expect(
      screen.getByText(/指标可由保留的原始事件重建/),
    ).toBeInTheDocument();
  });
});
