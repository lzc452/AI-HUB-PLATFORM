import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry } from "@ai-hub/contracts";

import { ApiError } from "../../shared/api/client";
import { App } from "../../App";

const {
  applicationFeedbackState,
  catalogEntryState,
  commentMutateAsync,
  commentsState,
  feedbackMutate,
  recommendedState,
} = vi.hoisted(() => {
  const catalogEntryState = {
    data: undefined as CatalogEntry | undefined,
    error: undefined as ApiError | undefined,
    isError: false,
    isPending: true,
  };
  const recommendedState = {
    data: {
      items: [
        {
          applicationId: "app-ocr-2",
          categoryId: "cat-ocr",
          currentVersionId: "ver-2",
          deliveryChannels: ["web"],
          departmentId: "dept-finance",
          deprecatedReason: null,
          healthStatus: "healthy",
          likeCount: 980,
          name: "发票识别助手",
          publishedAt: "2026-06-10T00:00:00.000Z",
          ratingAverage: 4.6,
          replacementApplicationId: null,
          summary: "财务发票自动识别与归档。",
          tagIds: ["发票"],
          trustLabels: ["verified"],
        },
        {
          applicationId: "app-doc-1",
          categoryId: "cat-doc",
          currentVersionId: "ver-3",
          deliveryChannels: ["web", "mobile"],
          departmentId: "dept-hr",
          deprecatedReason: null,
          healthStatus: "healthy",
          likeCount: 540,
          name: "合同审查助手",
          publishedAt: "2026-05-20T00:00:00.000Z",
          ratingAverage: 4.3,
          replacementApplicationId: null,
          summary: "人事合同智能审查。",
          tagIds: ["合同"],
          trustLabels: ["recommended"],
        },
      ],
      page: 1,
      pageSize: 5,
      total: 2,
    },
    error: null,
    isError: false,
    isPending: false,
  };
  const commentsState = {
    data: { items: [], total: 0 } as {
      items: Array<{
        applicationId: string;
        applicationVersionId: string;
        authorEmployeeId: string;
        body: string;
        commentId: string;
        createdAt: string;
        displayAnonymously: boolean;
        hiddenAt: string | null;
        parentCommentId: string | null;
        updatedAt: string;
      }>;
      total: number;
    },
  };
  const commentMutateAsync = vi.fn();
  const feedbackMutate = vi.fn();
  const applicationFeedbackState = {
    data: [] as Array<{
      applicationId: string;
      applicationVersionId: string | null;
      body: string;
      creatorEmployeeId: string;
      createdAt: string;
      feedbackId: string;
      resolution: string | null;
      resolvedAt: string | null;
      status: string;
      type: string;
    }>,
  };
  return {
    applicationFeedbackState,
    catalogEntryState,
    commentMutateAsync,
    commentsState,
    feedbackMutate,
    recommendedState,
  };
});

vi.mock("../../modules/marketplace/useCatalog", () => ({
  useCatalogEntry: () => catalogEntryState,
  useCatalogSearch: () => recommendedState,
  useVersions: () => ({ data: [], isPending: false }),
  useRiskDescription: () => ({ data: undefined, isPending: false }),
  useSaveRiskDescription: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("../../modules/auth/useIdentity", () => ({
  useActor: () => ({ data: undefined, isPending: true }),
  useDepartments: () => ({
    data: [{ departmentId: "dept-finance", name: "财务部" }],
    isPending: false,
  }),
  useEmployees: () => ({ data: [], isPending: false }),
}));

vi.mock("../../modules/interaction/useInteraction", () => ({
  useRateApplication: () => ({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  }),
  useToggleLike: () => ({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  }),
  useRatings: () => ({ data: { items: [], total: 0 }, isPending: false }),
  useComments: () => ({ data: commentsState.data, isPending: false }),
  useHideComment: () => ({ isPending: false, mutate: vi.fn() }),
  useRestoreComment: () => ({ isPending: false, mutate: vi.fn() }),
  useCreateComment: () => ({
    isPending: false,
    mutateAsync: commentMutateAsync,
  }),
  useCreateFeedback: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useMyFeedback: () => ({ data: [], isPending: false }),
  useApplicationFeedback: () => ({
    data: applicationFeedbackState.data,
    isPending: false,
  }),
  useUpdateFeedbackStatus: () => ({ isPending: false, mutate: feedbackMutate }),
}));

function mockEntry(): CatalogEntry {
  return {
    applicationId: "app-ocr",
    categoryId: "cat-ocr",
    currentVersionId: "ver-1",
    deliveryChannels: ["web"],
    departmentId: "dept-finance",
    deprecatedReason: null,
    healthStatus: "healthy",
    likeCount: 1620,
    ratingCount: 24,
    maintainers: ["测试维护人"],
    attachments: [
      { name: "使用手册", type: "pdf", size: "2.4 MB" },
      { name: "部署指南", type: "docx", size: "1.1 MB" },
    ],
    capabilities: {
      canResolveDelivery: true,
      canLike: true,
      canRate: true,
      canComment: true,
      canSubmitFeedback: true,
      canModerateComments: false,
      canEditRisk: false,
    },
    name: "OCR 票据识别",
    publishedAt: "2026-07-01T00:00:00.000Z",
    ratingAverage: 4.8,
    replacementApplicationId: null,
    summary: "面向财务部门的票据智能识别工具。",
    tagIds: ["票据", "识别", "财务"],
    trustLabels: ["verified", "recommended"],
  };
}

describe("MarketplaceDetailPage", () => {
  beforeEach(() => {
    catalogEntryState.data = mockEntry();
    commentsState.data = { items: [], total: 0 };
    applicationFeedbackState.data = [];
    catalogEntryState.error = undefined;
    catalogEntryState.isError = false;
    catalogEntryState.isPending = false;
    globalThis.window.history.pushState({}, "", "/marketplace/app-ocr");
  });

  it("renders the application header and description sections", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "OCR 票据识别" }),
    ).toBeInTheDocument();
    expect(screen.getByText("已审核")).toBeInTheDocument();
    expect(screen.getByText("推荐")).toBeInTheDocument();
    expect(screen.getAllByText("财务部").length).toBeGreaterThan(0);
    expect(screen.getByText("详细介绍")).toBeInTheDocument();
    expect(screen.getByText("业务场景：")).toBeInTheDocument();
    expect(screen.getByText("解决问题：")).toBeInTheDocument();
    expect(screen.getByText("关键特点：")).toBeInTheDocument();
    expect(screen.getByText("截图预览")).toBeInTheDocument();
    expect(screen.getByText("相关附件")).toBeInTheDocument();
    expect(screen.getByText("应用信息")).toBeInTheDocument();
    expect((await screen.findAllByText("相关推荐")).length).toBeGreaterThan(0);
    expect(screen.getByText("使用手册")).toBeInTheDocument();
    expect(screen.getByText("部署指南")).toBeInTheDocument();
  });

  it("exposes the four detail tabs", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "OCR 票据识别" });
    for (const label of ["描述", "版本历史", "评价管理", "风险说明"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("switches tabs and syncs the URL", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "OCR 票据识别" });
    fireEvent.click(screen.getByRole("tab", { name: "版本历史" }));

    expect(await screen.findByText("暂无版本记录")).toBeInTheDocument();
    expect(globalThis.window.location.search).toContain("tab=history");

    fireEvent.click(screen.getByRole("tab", { name: "描述" }));
    expect(await screen.findByText("详细介绍")).toBeInTheDocument();
    expect(globalThis.window.location.search).not.toContain("tab=");
  });

  it("lists related applications excluding the current entry", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "OCR 票据识别" });
    expect(
      screen.getByRole("link", { name: "查看应用 发票识别助手" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "查看应用 合同审查助手" }),
    ).toBeInTheDocument();
  });

  it("shows the not-found block for a 404 entry", async () => {
    catalogEntryState.data = undefined;
    catalogEntryState.isError = true;
    catalogEntryState.error = new ApiError(404, "not_found");

    render(<App />);

    expect(await screen.findByText("页面不存在")).toBeInTheDocument();
  });

  it("shows the forbidden block for a 403 entry", async () => {
    catalogEntryState.data = undefined;
    catalogEntryState.isError = true;
    catalogEntryState.error = new ApiError(403, "forbidden");

    render(<App />);

    expect(await screen.findByText("没有访问权限")).toBeInTheDocument();
  });

  it("renders a busy skeleton while the entry loads", async () => {
    catalogEntryState.data = undefined;
    catalogEntryState.isPending = true;

    const { container } = render(<App />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText("OCR 票据识别")).not.toBeInTheDocument();
  });

  it("允许所有者对根评论发表官方回复", async () => {
    catalogEntryState.data = {
      ...mockEntry(),
      capabilities: {
        canResolveDelivery: true,
        canLike: true,
        canRate: true,
        canComment: true,
        canSubmitFeedback: true,
        canModerateComments: false,
        canEditRisk: false,
        canReplyOfficial: true,
      },
    };
    commentsState.data = {
      items: [
        {
          applicationId: "app-ocr",
          applicationVersionId: "ver-1",
          authorEmployeeId: "E200",
          body: "希望支持批量识别",
          commentId: "comment-1",
          createdAt: "2026-08-15T10:00:00.000Z",
          displayAnonymously: false,
          hiddenAt: null,
          parentCommentId: null,
          updatedAt: "2026-08-15T10:00:00.000Z",
        },
      ],
      total: 1,
    };
    commentMutateAsync.mockResolvedValue({});
    render(<App />);

    await screen.findByRole("heading", { name: "OCR 票据识别" });
    fireEvent.click(screen.getByRole("tab", { name: "评价管理" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "回复 comment-1" }),
    );
    fireEvent.change(screen.getByLabelText("官方回复内容"), {
      target: { value: "该能力已在规划中" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送回复" }));

    expect(commentMutateAsync).toHaveBeenCalledWith({
      parentCommentId: "comment-1",
      body: "该能力已在规划中",
    });
  });

  it("所有者可在反馈管理中处理员工反馈", async () => {
    catalogEntryState.data = {
      ...mockEntry(),
      capabilities: {
        canResolveDelivery: true,
        canLike: true,
        canRate: true,
        canComment: true,
        canSubmitFeedback: true,
        canModerateComments: false,
        canEditRisk: false,
        canReplyOfficial: true,
      },
    };
    applicationFeedbackState.data = [
      {
        applicationId: "app-ocr",
        applicationVersionId: "ver-1",
        body: "希望支持批量识别",
        creatorEmployeeId: "E200",
        createdAt: "2026-08-15T10:00:00.000Z",
        feedbackId: "feedback-1",
        resolution: null,
        resolvedAt: null,
        status: "open",
        type: "suggestion",
      },
    ];
    feedbackMutate.mockImplementation(() => undefined);
    render(<App />);

    await screen.findByRole("heading", { name: "OCR 票据识别" });
    fireEvent.click(screen.getByRole("tab", { name: "评价管理" }));
    expect(await screen.findByText("反馈管理")).toBeInTheDocument();
    expect(screen.getByText("希望支持批量识别")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "反馈处理状态" }));
    fireEvent.click(await screen.findByTitle("已解决"));
    fireEvent.change(screen.getByLabelText("反馈处理说明"), {
      target: { value: "已排期处理" },
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));

    expect(feedbackMutate).toHaveBeenCalledWith({
      feedbackId: "feedback-1",
      status: "resolved",
      resolution: "已排期处理",
    });
  });
});
