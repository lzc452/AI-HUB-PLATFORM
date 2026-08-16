import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./modules/application/adminList.client", () => ({
  getAdminApplicationList: vi.fn(async () => ({
    items: [
      {
        applicationId: "app-rd-perf-001",
        name: "统一研发效能数据看板",
        summary: "",
        categoryId: "cat-rd",
        status: "published",
        currentVersion: "v1.0.0",
        currentVersionId: "version-rd-perf-001",
        ownerName: "E0001",
        departmentName: "研发部",
        deliveryChannels: ["web"],
        updatedAt: new Date().toISOString(),
        isMine: true,
        needsMyReview: false,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
  })),
}));

vi.mock("./modules/innovation/useDemand", () => ({
  useCreateDemandDraft: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUploadDemandAttachment: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useAddDemandComment: () => ({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  }),
  useDemand: () => ({ data: undefined, isPending: true }),
  useDemandComments: () => ({ data: [] }),
  useDemandList: () => ({
    data: {
      items: [
        {
          audienceDepartmentId: null,
          audienceType: "all",
          commentCount: 3,
          createdAt: "2026-07-01T00:00:00.000Z",
          demandId: "demand-1",
          desiredOutcome: "让团队可以追溯引用来源。",
          displayAnonymously: true,
          likeCount: 12,
          ownerEmployeeId: null,
          primarySolutionApplicationId: null,
          priorityExplanation: null,
          priorityScore: null,
          problemStatement: "团队需要一个能返回引用来源的内部知识助手。",
          requesterEmployeeId: null,
          reviewReason: null,
          status: "published",
          title: "Internal knowledge assistant",
          updatedAt: "2026-07-01T00:00:00.000Z",
          version: 1,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    error: null,
    isError: false,
    isPending: false,
  }),
  useLikeDemand: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("./modules/application/useApplication", () => {
  const application = {
    applicationId: "app-001",
    currentVersionId: "ver-1",
    departmentId: "dept-1",
    maintainerEmployeeId: "E0002",
    name: "Internal AI assistant",
    ownerEmployeeId: "E0001",
    status: "published",
    summary: "内部 AI 流程助手",
  };
  const publishedVersion = {
    applicationId: "app-001",
    applicationVersionId: "ver-1",
    artifactKey: "artifacts/app-001/1.2.0",
    artifactSha256: "sha256",
    artifactSignature: null,
    changelog: "首次发布",
    createdAt: "2026-07-01T00:00:00.000Z",
    createdByEmployeeId: "E0001",
    scanStatus: "passed",
    version: "1.2.0",
  };
  const settled = {
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
  };
  return {
    useApplication: (applicationId?: string) => ({
      ...settled,
      data: applicationId ? application : undefined,
    }),
    useApplicationWorkspace: () => ({
      ...settled,
      data: {
        application,
        deliveries: [],
        reviewQueue: null,
        reviews: [],
        versions: [publishedVersion],
      },
    }),
    useApplicationDeliveries: () => ({ ...settled, data: [] }),
    useApplicationReviews: () => ({ ...settled, data: [] }),
    useApplicationVersions: () => ({ ...settled, data: [publishedVersion] }),
    useReviewQueue: () => ({ ...settled, data: null }),
    useClaimReview: () => ({ isPending: false, mutate: vi.fn() }),
    useReleaseReview: () => ({ isPending: false, mutate: vi.fn() }),
    useReviewApplicationVersion: () => ({
      isPending: false,
      mutate: vi.fn(),
    }),
    useConfigureDelivery: () => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }),
    useSubmitApplicationReview: () => ({
      isPending: false,
      mutate: vi.fn(),
    }),
    usePublishApplication: () => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }),
    useArtifactUpload: () => ({
      start: { mutateAsync: vi.fn() },
      complete: { mutateAsync: vi.fn() },
    }),
    useArtifactUploadStatus: () => ({ ...settled, data: undefined }),
    useAssets: () => ({
      query: { ...settled, data: [] },
      remove: { mutateAsync: vi.fn() },
    }),
    useCreateVersion: () => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }),
    useArchiveApplication: () => ({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    }),
    useCreatorApplications: () => ({ ...settled, data: undefined }),
    useCreatorSummary: () => ({ ...settled, data: undefined }),
    usePublishedVersion: () => ({ ...settled, data: publishedVersion }),
    useWithdrawApplication: () => ({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    }),
  };
});

const styles = readFileSync(
  path.join(process.cwd(), "src", "styles.css"),
  "utf8",
);

describe("App", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/");
  });

  it("keeps Request and AbortSignal constructors compatible", () => {
    const signal = new AbortController().signal;

    expect(
      () => new Request("http://localhost/route-test", { signal }),
    ).not.toThrow();
  });

  it("renders a skip link and accessible primary navigation", async () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "跳到主要内容" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(
      screen.getByRole("navigation", { name: "主导航" }),
    ).toBeInTheDocument();
    const primaryNavigation = screen.getByRole("navigation", {
      name: "主导航",
    });
    expect(
      await within(primaryNavigation).findByRole("link", { name: /应用市场/ }),
    ).toBeInTheDocument();
    expect(
      await within(primaryNavigation).findByRole("link", { name: /创新广场/ }),
    ).toBeInTheDocument();
  });

  it("keeps the header at the fixed 56px height", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toHaveStyle({
      background: "#fff",
      height: "56px",
      lineHeight: "56px",
    });
  });

  it("keeps the skip target focusable for keyboard users", () => {
    render(<App />);

    const skipLink = screen.getByRole("link", { name: "跳到主要内容" });
    const mainContent = screen.getByRole("main");

    skipLink.focus();

    expect(skipLink).toHaveFocus();
    expect(mainContent).toHaveAttribute("id", "main-content");
    expect(mainContent).toHaveAttribute("tabindex", "-1");
  });

  it("renders a breadcrumb navigation on the marketplace page", async () => {
    render(<App />);

    const breadcrumb = await screen.findByRole("navigation", {
      name: "面包屑",
    });
    expect(within(breadcrumb).getByText("应用市场")).toBeInTheDocument();
  });

  it("exposes the assistant menu entry", async () => {
    render(<App />);

    const primaryNavigation = await screen.findByRole("navigation", {
      name: "主导航",
    });
    expect(
      within(primaryNavigation).getByRole("link", { name: "AI 助手" }),
    ).toHaveAttribute("href", "/assistant");
  });

  it("shows the permission-filtered marketplace by default", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "发现企业内部 AI 应用" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("统一查找、体验与分享各部门 AI 工具"),
    ).toBeInTheDocument();
  });

  it("navigates to the innovation square demand page", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /创新广场/ }));

    expect(
      await screen.findByRole("heading", { name: "创新广场" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/结构化需求与受众治理/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "查看需求详情" }),
    ).toBeInTheDocument();
  });

  it("exposes organization and security administration routes", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /组织管理/ }));
    expect(
      await screen.findByRole("heading", { name: "组织管理" }),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("link", { name: /系统安全/ }));
    expect(
      await screen.findByRole("heading", { name: "系统安全" }),
    ).toBeInTheDocument();
  });

  it("exposes the application administration navigation", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /应用管理/ }));

    // 新设计：Hero 标题 + KPI 卡片 + 表格行链接
    expect(
      await screen.findByRole("heading", { name: "应用管理" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "创建应用" }),
    ).toBeInTheDocument();
    expect(screen.getByText("应用总数")).toBeInTheDocument();
    expect(screen.getByText("待审核")).toBeInTheDocument();
    expect(screen.getByText("已上架")).toBeInTheDocument();
    expect(screen.getByText("交付异常")).toBeInTheDocument();
    // 表格中第一个应用名称是到 /applications/[id] 的链接
    expect(
      await screen.findByRole("link", {
        name: "查看应用 统一研发效能数据看板",
      }),
    ).toHaveAttribute("href", "/applications/app-rd-perf-001");
  });

  it.each([
    ["/applications/app-001", "应用详情"],
    ["/applications/app-001/versions", "版本管理"],
    ["/applications/app-001/review", "审核工作台"],
    ["/applications/app-001/delivery", "交付配置"],
  ])("renders the application route %s", async (route, heading) => {
    globalThis.window.history.pushState({}, "", route);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
  });

  it("shows application lifecycle and delivery state labels", async () => {
    globalThis.window.history.pushState({}, "", "/applications/app-001");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "应用详情" }),
    ).toBeInTheDocument();

    for (const label of [
      "草稿",
      "审核中",
      "已通过",
      "已上架",
      "已驳回",
      "已下架",
      "已归档",
      "当前版本",
    ]) {
      expect(
        screen.getAllByText(label, { exact: true }).length,
      ).toBeGreaterThan(0);
    }
    expect(
      screen.getByText("数据已通过内部 API 接入；可用操作受身份与权限控制。"),
    ).toBeInTheDocument();
  });

  it("keeps a reduced-motion baseline in the global stylesheet", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation-duration: 0.01ms !important;");
    expect(styles).toContain("scroll-behavior: auto !important;");
    expect(styles).toContain("transition-duration: 0.01ms !important;");
  });
});
