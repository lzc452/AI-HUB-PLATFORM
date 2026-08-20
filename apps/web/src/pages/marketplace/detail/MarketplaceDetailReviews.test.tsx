import type { CommentOutput } from "@ai-hub/contracts";
import {
  QueryClient,
  QueryClientProvider,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useReportComment } from "../../../modules/interaction/useInteraction";
import { ApiError } from "../../../shared/api/client";
import { MarketplaceDetailReviews } from "./MarketplaceDetailReviews";

const hoisted = vi.hoisted(() => ({
  reportComment: vi.fn(),
  showErrorMessage: vi.fn(),
  showSuccessMessage: vi.fn(),
}));

vi.mock(
  "../../../modules/interaction/interaction.client",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../modules/interaction/interaction.client")
      >();
    return { ...actual, reportComment: hoisted.reportComment };
  },
);

vi.mock("../../../shared/ui/message", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../shared/ui/message")>();
  return {
    ...actual,
    showErrorMessage: hoisted.showErrorMessage,
    showSuccessMessage: hoisted.showSuccessMessage,
  };
});

const rootComment: CommentOutput = {
  applicationId: "app-1",
  applicationVersionId: "ver-1",
  authorEmployeeId: "E100",
  authorStatus: "active",
  body: "希望支持批量识别",
  commentId: "comment-1",
  commentKind: "user",
  createdAt: "2026-08-15T10:00:00.000Z",
  displayAnonymously: false,
  hiddenAt: null,
  parentCommentId: null,
  updatedAt: "2026-08-15T10:00:00.000Z",
};

const officialReply: CommentOutput = {
  ...rootComment,
  authorEmployeeId: "E200",
  body: "该能力已在规划中",
  commentId: "reply-1",
  commentKind: "official",
  parentCommentId: "comment-1",
};

const userReply: CommentOutput = {
  ...rootComment,
  authorEmployeeId: "E300",
  body: "我也遇到了同样的问题",
  commentId: "reply-user",
  commentKind: "user",
  parentCommentId: "comment-1",
};

const disabledAuthorComment: CommentOutput = {
  ...rootComment,
  authorStatus: "disabled",
  body: "停用员工评论",
  commentId: "comment-disabled",
};

const anonymousDisabledAuthorComment: CommentOutput = {
  ...rootComment,
  authorStatus: "disabled",
  displayAnonymously: true,
  body: "匿名停用员工评论",
  commentId: "comment-anon-disabled",
};

function stubMutation<T>(): T {
  return {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
  } as unknown as T;
}

type CreateCommentMutation = UseMutationResult<
  CommentOutput,
  unknown,
  {
    parentCommentId?: string | null;
    body: string;
    displayAnonymously?: boolean;
  }
>;

/** 用真实 useReportComment 接线组件，便于在组件测试中验证成功/错误提示。 */
function ReviewsHarness({
  comments = [rootComment, officialReply],
  canReply = false,
  myEmployeeId = null,
  createCommentMutation = stubMutation<CreateCommentMutation>(),
}: {
  comments?: readonly CommentOutput[];
  canReply?: boolean;
  myEmployeeId?: string | null;
  createCommentMutation?: CreateCommentMutation;
} = {}) {
  const reportComment = useReportComment("app-1");
  return (
    <MarketplaceDetailReviews
      applicationFeedback={[]}
      canReply={canReply}
      canReplyOfficial={false}
      comments={{ items: comments, total: comments.length }}
      commentsPage={1}
      commentsPending={false}
      createComment={createCommentMutation}
      createFeedback={stubMutation()}
      isModerator={false}
      myEmployeeId={myEmployeeId}
      myFeedback={[]}
      onCommentsPageChange={() => undefined}
      onHideComment={() => undefined}
      onRestoreComment={() => undefined}
      reportComment={reportComment}
      updateFeedback={stubMutation()}
    />
  );
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function renderReviews(options?: {
  comments?: readonly CommentOutput[];
  canReply?: boolean;
  myEmployeeId?: string | null;
  createCommentMutation?: CreateCommentMutation;
}) {
  return render(<ReviewsHarness {...options} />, { wrapper: createWrapper() });
}

describe("MarketplaceDetailReviews 评论举报", () => {
  beforeEach(() => {
    hoisted.reportComment.mockReset();
    hoisted.showErrorMessage.mockReset();
    hoisted.showSuccessMessage.mockReset();
  });

  it("每条评论与官方回复都有举报入口", () => {
    renderReviews();

    expect(
      screen.getByRole("button", { name: "举报 comment-1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "举报 reply-1" }),
    ).toBeInTheDocument();
  });

  it("举报原因为空时不提交并提示校验错误", async () => {
    renderReviews();
    fireEvent.click(screen.getByRole("button", { name: "举报 comment-1" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "提交举报" }));

    expect(
      await within(dialog).findByText("请填写举报原因"),
    ).toBeInTheDocument();
    expect(hoisted.reportComment).not.toHaveBeenCalled();
  });

  it("填写原因提交后调用 reportComment、提示成功并关闭弹窗", async () => {
    hoisted.reportComment.mockResolvedValue({ reportId: "report-1" });
    renderReviews();
    fireEvent.click(screen.getByRole("button", { name: "举报 comment-1" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("举报原因"), {
      target: { value: "包含不当内容" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "提交举报" }));

    await waitFor(() =>
      expect(hoisted.reportComment).toHaveBeenCalledWith("app-1", "comment-1", {
        reason: "包含不当内容",
      }),
    );
    await waitFor(() =>
      expect(hoisted.showSuccessMessage).toHaveBeenCalledWith(
        "举报已提交，感谢反馈",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("提交失败时提示错误且弹窗保留原内容供重试", async () => {
    hoisted.reportComment.mockRejectedValue(
      new ApiError(400, "COMMENT_NOT_FOUND", "评论不存在"),
    );
    renderReviews();
    fireEvent.click(screen.getByRole("button", { name: "举报 reply-1" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("举报原因"), {
      target: { value: "官方回复涉嫌攻击" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "提交举报" }));

    await waitFor(() =>
      expect(hoisted.showErrorMessage).toHaveBeenCalledWith(
        expect.any(ApiError),
        "举报提交失败",
      ),
    );
    expect(hoisted.reportComment).toHaveBeenCalledWith("app-1", "reply-1", {
      reason: "官方回复涉嫌攻击",
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByDisplayValue("官方回复涉嫌攻击"),
    ).toBeInTheDocument();
  });
});

describe("MarketplaceDetailReviews 停用员工作者显示", () => {
  it("实名评论作者为停用员工时显示已停用用户标签且不显示工号", () => {
    renderReviews({ comments: [disabledAuthorComment] });

    expect(screen.getByText("已停用用户")).toBeInTheDocument();
    expect(screen.queryByText("E100")).not.toBeInTheDocument();
  });

  it("停用员工 + 匿名评论保持匿名用户展示，不显示停用标记", () => {
    renderReviews({ comments: [anonymousDisabledAuthorComment] });

    expect(screen.getByText("匿名用户")).toBeInTheDocument();
    expect(screen.queryByText("已停用用户")).not.toBeInTheDocument();
    expect(screen.queryByText("E100")).not.toBeInTheDocument();
  });

  it("正常作者显示工号", () => {
    renderReviews({ comments: [rootComment] });

    expect(screen.getByText("E100")).toBeInTheDocument();
    expect(screen.queryByText("已停用用户")).not.toBeInTheDocument();
  });
});

describe("MarketplaceDetailReviews 匿名展示选项", () => {
  it("默认发表实名评论（displayAnonymously: false）", async () => {
    const createCommentMutateAsync = vi.fn(async () => ({}));
    renderReviews({
      createCommentMutation: {
        isPending: false,
        mutate: vi.fn(),
        mutateAsync: createCommentMutateAsync,
      } as unknown as CreateCommentMutation,
    });

    fireEvent.change(
      screen.getByPlaceholderText("分享你的使用体验或提出问题…"),
      {
        target: { value: "很好用" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "发表评论" }));

    await waitFor(() =>
      expect(createCommentMutateAsync).toHaveBeenCalledWith({
        body: "很好用",
        displayAnonymously: false,
      }),
    );
  });

  it("开启匿名展示后发表匿名评论（displayAnonymously: true）", async () => {
    const createCommentMutateAsync = vi.fn(async () => ({}));
    renderReviews({
      createCommentMutation: {
        isPending: false,
        mutate: vi.fn(),
        mutateAsync: createCommentMutateAsync,
      } as unknown as CreateCommentMutation,
    });

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(
      screen.getByPlaceholderText("分享你的使用体验或提出问题…"),
      {
        target: { value: "匿名反馈" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "发表评论" }));

    await waitFor(() =>
      expect(createCommentMutateAsync).toHaveBeenCalledWith({
        body: "匿名反馈",
        displayAnonymously: true,
      }),
    );
    expect(screen.getByText("匿名展示不影响后台审计")).toBeInTheDocument();
  });

  it("提交后匿名开关重置为实名", async () => {
    const createCommentMutateAsync = vi.fn(async () => ({}));
    renderReviews({
      createCommentMutation: {
        isPending: false,
        mutate: vi.fn(),
        mutateAsync: createCommentMutateAsync,
      } as unknown as CreateCommentMutation,
    });

    const anonymousSwitch = screen.getByRole("switch");
    fireEvent.click(anonymousSwitch);
    fireEvent.change(
      screen.getByPlaceholderText("分享你的使用体验或提出问题…"),
      {
        target: { value: "匿名反馈" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "发表评论" }));
    await waitFor(() => expect(createCommentMutateAsync).toHaveBeenCalled());

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});

describe("MarketplaceDetailReviews 评论回复", () => {
  it("有回复权限时他人的根评论显示回复按钮；点击展开回复输入区", () => {
    renderReviews({ canReply: true });

    const replyButton = screen.getByRole("button", { name: "回复 comment-1" });
    fireEvent.click(replyButton);
    expect(screen.getByPlaceholderText("输入回复…")).toBeInTheDocument();
  });

  it("自己的评论不显示回复按钮（即使有回复权限）", () => {
    renderReviews({ canReply: true, myEmployeeId: "E100" });

    expect(
      screen.queryByRole("button", { name: "回复 comment-1" }),
    ).not.toBeInTheDocument();
  });

  it("无回复权限时不显示回复按钮", () => {
    renderReviews({ canReply: false });

    expect(
      screen.queryByRole("button", { name: "回复 comment-1" }),
    ).not.toBeInTheDocument();
  });

  it("回复他人评论默认实名，提交载荷含 parentCommentId 与 displayAnonymously: false", async () => {
    const createCommentMutateAsync = vi.fn(async () => ({}));
    renderReviews({
      canReply: true,
      createCommentMutation: {
        isPending: false,
        mutate: vi.fn(),
        mutateAsync: createCommentMutateAsync,
      } as unknown as CreateCommentMutation,
    });

    fireEvent.click(screen.getByRole("button", { name: "回复 comment-1" }));
    fireEvent.change(screen.getByPlaceholderText("输入回复…"), {
      target: { value: "我也遇到了同样的问题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送回复" }));

    await waitFor(() =>
      expect(createCommentMutateAsync).toHaveBeenCalledWith({
        parentCommentId: "comment-1",
        body: "我也遇到了同样的问题",
        displayAnonymously: false,
      }),
    );
  });

  it("开启回复匿名开关后提交匿名回复（displayAnonymously: true）", async () => {
    const createCommentMutateAsync = vi.fn(async () => ({}));
    renderReviews({
      canReply: true,
      createCommentMutation: {
        isPending: false,
        mutate: vi.fn(),
        mutateAsync: createCommentMutateAsync,
      } as unknown as CreateCommentMutation,
    });

    fireEvent.click(screen.getByRole("button", { name: "回复 comment-1" }));
    fireEvent.click(screen.getByLabelText("回复匿名展示"));
    fireEvent.change(screen.getByPlaceholderText("输入回复…"), {
      target: { value: "匿名回复" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送回复" }));

    await waitFor(() =>
      expect(createCommentMutateAsync).toHaveBeenCalledWith({
        parentCommentId: "comment-1",
        body: "匿名回复",
        displayAnonymously: true,
      }),
    );
  });

  it("官方回复显示蓝色官方回复标签；用户回复显示作者工号", () => {
    renderReviews({
      comments: [rootComment, officialReply, userReply],
    });

    expect(screen.getByText("官方回复")).toBeInTheDocument();
    expect(screen.getByText("E300")).toBeInTheDocument();
  });

  it("匿名用户回复显示匿名用户而非工号", () => {
    renderReviews({
      comments: [rootComment, { ...userReply, displayAnonymously: true }],
    });

    expect(screen.getByText("匿名用户")).toBeInTheDocument();
    expect(screen.queryByText("E300")).not.toBeInTheDocument();
  });
});
