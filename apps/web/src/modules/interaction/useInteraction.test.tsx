import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../shared/api/client";
import {
  useCreateComment,
  useHideComment,
  useReportComment,
  useToggleLike,
} from "./useInteraction";

const hoisted = vi.hoisted(() => ({
  createComment: vi.fn(),
  hideComment: vi.fn(),
  reportComment: vi.fn(),
  showErrorMessage: vi.fn(),
  showSuccessMessage: vi.fn(),
  toggleLike: vi.fn(),
}));

vi.mock("./interaction.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./interaction.client")>();
  return {
    ...actual,
    createComment: hoisted.createComment,
    hideComment: hoisted.hideComment,
    reportComment: hoisted.reportComment,
    toggleLike: hoisted.toggleLike,
  };
});

vi.mock("../../shared/ui/message", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../shared/ui/message")>();
  return {
    ...actual,
    showErrorMessage: hoisted.showErrorMessage,
    showSuccessMessage: hoisted.showSuccessMessage,
  };
});

const searchKey = ["catalog", "search", { query: "", sort: "recommended" }];

function seedCatalog(queryClient: QueryClient) {
  queryClient.setQueryData(["catalog", "entry", "app-1"], {
    applicationId: "app-1",
    name: "平台助手",
    likedByMe: false,
    likeCount: 10,
  });
  queryClient.setQueryData(searchKey, {
    items: [
      {
        applicationId: "app-1",
        name: "平台助手",
        likedByMe: false,
        likeCount: 10,
      },
      {
        applicationId: "app-2",
        name: "财务助手",
        likedByMe: true,
        likeCount: 3,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 2,
  });
  // 非目录条目缓存（版本/风险说明）应原样保留。
  queryClient.setQueryData(["catalog", "risk", "app-1"], {
    riskDescription: "请评估风险",
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

describe("useReportComment", () => {
  beforeEach(() => {
    hoisted.showErrorMessage.mockReset();
    hoisted.showSuccessMessage.mockReset();
    hoisted.reportComment.mockReset();
  });

  it("提交成功后提示“举报已提交，感谢反馈”", async () => {
    hoisted.reportComment.mockResolvedValue({ reportId: "report-1" });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useReportComment("app-1"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        commentId: "comment-1",
        reason: "包含不当内容",
      });
    });

    expect(hoisted.reportComment).toHaveBeenCalledWith("app-1", "comment-1", {
      reason: "包含不当内容",
    });
    await waitFor(() =>
      expect(hoisted.showSuccessMessage).toHaveBeenCalledWith(
        "举报已提交，感谢反馈",
      ),
    );
  });

  it("失败时提示“举报提交失败”", async () => {
    hoisted.reportComment.mockRejectedValue(
      new ApiError(400, "COMMENT_NOT_FOUND", "评论不存在"),
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useReportComment("app-1"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ commentId: "comment-1", reason: "x" }),
      ).rejects.toBeInstanceOf(ApiError);
    });

    expect(hoisted.showErrorMessage).toHaveBeenCalledWith(
      expect.any(ApiError),
      "举报提交失败",
    );
  });
});

describe("useToggleLike", () => {
  beforeEach(() => {
    hoisted.showErrorMessage.mockReset();
    hoisted.showSuccessMessage.mockReset();
    hoisted.toggleLike.mockReset();
  });

  it("成功后乐观翻转详情与列表缓存的 likedByMe/likeCount", async () => {
    hoisted.toggleLike.mockResolvedValue({ liked: true });
    const queryClient = createQueryClient();
    seedCatalog(queryClient);
    const { result } = renderHook(() => useToggleLike("app-1"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(
      queryClient.getQueryData(["catalog", "entry", "app-1"]),
    ).toMatchObject({ likedByMe: true, likeCount: 11 });
    expect(queryClient.getQueryData(searchKey)).toMatchObject({
      items: [
        { applicationId: "app-1", likedByMe: true, likeCount: 11 },
        { applicationId: "app-2", likedByMe: true, likeCount: 3 },
      ],
    });
    expect(queryClient.getQueryData(["catalog", "risk", "app-1"])).toEqual({
      riskDescription: "请评估风险",
    });
    await waitFor(() =>
      expect(hoisted.showSuccessMessage).toHaveBeenCalledWith("点赞状态已更新"),
    );
  });

  it("已赞时取消点赞：likedByMe 翻转为 false 且 likeCount 减一", async () => {
    hoisted.toggleLike.mockResolvedValue({ liked: false });
    const queryClient = createQueryClient();
    seedCatalog(queryClient);
    queryClient.setQueryData(["catalog", "entry", "app-1"], {
      applicationId: "app-1",
      name: "平台助手",
      likedByMe: true,
      likeCount: 10,
    });
    const { result } = renderHook(() => useToggleLike("app-1"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(
      queryClient.getQueryData(["catalog", "entry", "app-1"]),
    ).toMatchObject({ likedByMe: false, likeCount: 9 });
  });

  it("失败时回滚乐观翻转并提示错误", async () => {
    hoisted.toggleLike.mockRejectedValue(new ApiError(500, "like_failed"));
    const queryClient = createQueryClient();
    seedCatalog(queryClient);
    const { result } = renderHook(() => useToggleLike("app-1"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(
        ApiError,
      );
    });

    // 详情与列表缓存恢复原状。
    expect(
      queryClient.getQueryData(["catalog", "entry", "app-1"]),
    ).toMatchObject({ likedByMe: false, likeCount: 10 });
    expect(queryClient.getQueryData(searchKey)).toMatchObject({
      items: [
        { applicationId: "app-1", likedByMe: false, likeCount: 10 },
        { applicationId: "app-2", likedByMe: true, likeCount: 3 },
      ],
    });
    expect(hoisted.showErrorMessage).toHaveBeenCalledWith(
      expect.any(ApiError),
      "点赞操作失败",
    );
  });
});

describe("useCreateComment 分页感知刷新", () => {
  beforeEach(() => {
    hoisted.showErrorMessage.mockReset();
    hoisted.showSuccessMessage.mockReset();
    hoisted.createComment.mockReset();
  });

  it("发表评论后按当前页精确失效评论列表查询（第 2 页）", async () => {
    hoisted.createComment.mockResolvedValue({ commentId: "comment-new" });
    const queryClient = createQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateComment("app-1", 2, 10), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ body: "新评论" });
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: ["interactions", "comments", "app-1", 2, 10],
    });
    await waitFor(() =>
      expect(hoisted.showSuccessMessage).toHaveBeenCalledWith("评论已发表"),
    );
  });

  it("未指定页时默认失效第 1 页", async () => {
    hoisted.createComment.mockResolvedValue({ commentId: "comment-new" });
    const queryClient = createQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateComment("app-1"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ body: "新评论" });
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: ["interactions", "comments", "app-1", 1, 20],
    });
  });
});

describe("useHideComment 分页感知刷新", () => {
  beforeEach(() => {
    hoisted.showErrorMessage.mockReset();
    hoisted.showSuccessMessage.mockReset();
    hoisted.hideComment.mockReset();
  });

  it("隐藏评论后按当前页精确失效评论列表查询", async () => {
    hoisted.hideComment.mockResolvedValue({ commentId: "comment-1" });
    const queryClient = createQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useHideComment("app-1", 2, 10), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("comment-1");
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: ["interactions", "comments", "app-1", 2, 10],
    });
    await waitFor(() =>
      expect(hoisted.showSuccessMessage).toHaveBeenCalledWith("评论已隐藏"),
    );
  });
});
