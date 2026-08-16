import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Modal, message } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import CreatorCenterPage from "./pages/creator/CreatorCenterPage";

/** 可在各用例中切换的 mock 返回状态。 */
const state = vi.hoisted(() => ({
  creatorApplications: undefined as unknown,
  withdrawMutate: vi.fn(),
}));

vi.mock("./modules/application/useApplication", () => ({
  useArchiveApplication: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
  useCreatorApplications: () => state.creatorApplications,
  useCreatorSummary: () => ({
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
  useWithdrawApplication: () => ({
    isPending: false,
    mutate: state.withdrawMutate,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("./modules/analytics/useAnalytics", () => ({
  useDashboard: () => ({
    data: { metrics: [] },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("./modules/auth/useIdentity", () => ({
  useActor: () => ({ data: { employeeId: "E0001" } }),
}));

const settled = {
  error: null,
  isError: false,
  isFetching: false,
  isPending: false,
  refetch: vi.fn(),
};

const sampleItems = [
  {
    applicationId: "app-001",
    categoryId: "办公效率",
    likeCount: 1200,
    name: "文档问答助手",
    publishedAt: "2026-05-01T00:00:00.000Z",
    ratingAverage: 4.8,
    status: "published",
    tagIds: ["问答"],
  },
  {
    applicationId: "app-002",
    categoryId: "",
    likeCount: 30,
    name: "智能报表分析",
    publishedAt: null,
    ratingAverage: null,
    status: "in_review",
    tagIds: [],
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/creator/app-001"]}>
      <Routes>
        <Route element={<CreatorCenterPage />} path="/creator/:applicationId" />
      </Routes>
    </MemoryRouter>,
  );
}

/** 取当前最新的确认弹窗（Modal.confirm 挂在 body portal，用例间可能有残留节点）。 */
function latestDialog(): HTMLElement {
  const dialogs = screen.getAllByRole("dialog");
  const dialog = dialogs[dialogs.length - 1];
  if (!dialog) {
    throw new Error("未找到确认弹窗");
  }
  return dialog;
}

describe("创作者中心页面", () => {
  afterEach(() => {
    // 先在 act 内销毁 portal 和 React 树，再清空 fake timer，避免 scheduler
    // 任务排到 jsdom teardown 之后访问已不存在的 window。
    act(() => {
      Modal.destroyAll();
      message.destroy();
      cleanup();
    });
    if (vi.isFakeTimers()) {
      act(() => {
        vi.runOnlyPendingTimers();
      });
      vi.useRealTimers();
    }
  });

  it("渲染页面标题与欢迎横幅文案", () => {
    state.creatorApplications = {
      ...settled,
      data: { items: sampleItems, page: 1, pageSize: 20, total: 2 },
    };

    renderPage();

    expect(
      screen.getByRole("heading", { name: "创作者中心" }),
    ).toBeInTheDocument();
    expect(screen.getByText("欢迎回来！您的 AI 创新中心")).toBeInTheDocument();
    expect(
      screen.getByText("统一查找、体验与分享各部门 AI 工具"),
    ).toBeInTheDocument();
  });

  it("展示四张核心指标卡", () => {
    state.creatorApplications = {
      ...settled,
      data: { items: sampleItems, page: 1, pageSize: 20, total: 2 },
    };

    renderPage();

    expect(screen.getByText("总发布应用")).toBeInTheDocument();
    expect(screen.getByText("累计点赞")).toBeInTheDocument();
    expect(screen.getByText("平均评分")).toBeInTheDocument();
    expect(screen.getByText("待审校核应用")).toBeInTheDocument();
  });

  it("无应用时表格区域显示空状态引导", () => {
    state.creatorApplications = {
      ...settled,
      data: { items: [], page: 1, pageSize: 20, total: 0 },
    };

    renderPage();

    expect(screen.getByText("您还没有创建任何应用")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /创建新应用/ }).length,
    ).toBeGreaterThan(0);
  });

  it("加载失败时使用 Message 提示且不渲染布局重试按钮", async () => {
    state.creatorApplications = {
      data: undefined,
      error: new Error("网络异常"),
      isError: true,
      isFetching: false,
      isPending: false,
      refetch: vi.fn(),
    };

    renderPage();

    expect(
      await screen.findByText("应用列表加载失败：网络异常"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /重\s*试/ }),
    ).not.toBeInTheDocument();
  });

  it("下架已发布应用需经确认框二次确认，取消后不触发下架", async () => {
    Modal.destroyAll();
    vi.useFakeTimers();
    state.creatorApplications = {
      ...settled,
      data: { items: sampleItems, page: 1, pageSize: 20, total: 2 },
    };
    state.withdrawMutate.mockClear();

    const { container } = renderPage();

    // 限定在页面容器内查询，避免与 Modal portal 中的同名按钮冲突。
    fireEvent.click(within(container).getByRole("button", { name: /下\s*架/ }));
    // antd Modal.confirm 通过 setTimeout 异步挂载确认框，推进虚拟时钟使其渲染。
    // 标题同时出现在 modal-title 与 confirm-title 两处，故用 getAllByText 断言。
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getAllByText("下架应用").length).toBeGreaterThan(0);
    expect(
      within(latestDialog()).getByText(
        "下架后应用将从市场移除，且无法即时恢复上架，确定要下架该应用吗？",
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(latestDialog()).getByRole("button", { name: /取\s*消/ }),
    );

    expect(state.withdrawMutate).not.toHaveBeenCalled();
  });

  it("确认后执行下架 mutation", async () => {
    Modal.destroyAll();
    vi.useFakeTimers();
    state.creatorApplications = {
      ...settled,
      data: { items: sampleItems, page: 1, pageSize: 20, total: 2 },
    };
    state.withdrawMutate.mockClear();

    const { container } = renderPage();

    fireEvent.click(within(container).getByRole("button", { name: /下\s*架/ }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getAllByText("下架应用").length).toBeGreaterThan(0);
    fireEvent.click(
      within(latestDialog()).getByRole("button", { name: /确认下架/ }),
    );

    expect(state.withdrawMutate).toHaveBeenCalledTimes(1);
    expect(state.withdrawMutate).toHaveBeenCalledWith("app-001");
  });
});
