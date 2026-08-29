import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./modules/marketplace/useCatalog", () => ({
  useCatalogEntry: () => ({ data: undefined, isPending: true }),
  useCatalogSearch: () => ({
    data: {
      items: [
        {
          applicationId: "app-platform",
          categoryId: "平台流程自动化",
          currentVersionId: "ver-1",
          deliveryChannels: ["web"],
          departmentId: "dept-1",
          deprecatedReason: null,
          healthStatus: "healthy",
          likeCount: 10,
          name: "平台助手",
          publishedAt: "2026-07-01T00:00:00.000Z",
          ratingAverage: 4.5,
          replacementApplicationId: null,
          summary: "面向平台团队的内部 AI 流程助手。",
          tagIds: [],
          trustLabels: ["verified"],
        },
      ],
      page: 1,
      pageSize: 6,
      total: 1,
    },
    error: null,
    isError: false,
    isPending: false,
  }),
  useCatalogCategories: () => ({ data: [] }),
}));

describe("Phase 4 market shell", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/console/");
  });

  it("shows fixed market sections, search and trust labels", async () => {
    render(<App />);

    expect(
      await screen.findByRole("searchbox", { name: "搜索应用" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("最新上架")).toBeInTheDocument();
    expect(screen.getByText("热门应用")).toBeInTheDocument();
    expect((await screen.findAllByText("已审核")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("平台助手")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "上一页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "收起菜单" }),
    ).toBeInTheDocument();
  });

  it("exposes notification and creator center routes", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /站内通知/ }));
    // 通知页重构为 antd Tabs：断言「全部」页签与空态
    expect(
      await screen.findByRole("tab", { name: "全部" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "未读" })).toBeInTheDocument();
    expect(screen.getByText("暂无通知")).toBeInTheDocument();

    globalThis.window.history.pushState(
      {},
      "",
      "/console/creator/app-platform",
    );
    render(<App />);
    // 创作者中心无 h1 标题：断言 KPI 指标卡（真实渲染元素）
    expect(await screen.findByText("总发布应用")).toBeInTheDocument();
    expect(screen.getByText("累计点赞")).toBeInTheDocument();
  });
});
