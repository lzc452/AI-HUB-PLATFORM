import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";
import {
  createComment,
  createFeedback,
  hideComment,
  listApplicationFeedback,
  listComments,
  listMyFeedback,
  listRatings,
  rateApplication,
  reportComment,
  restoreComment,
  toggleLike,
  updateFeedbackStatus,
} from "./interaction.client";

function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["catalog"] });
}

interface LikeableCatalogEntry {
  applicationId: string;
  likedByMe: boolean;
  likeCount: number;
}

function isLikeableEntry(value: unknown): value is LikeableCatalogEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { applicationId?: unknown }).applicationId === "string"
  );
}

function flipEntryLike(entry: LikeableCatalogEntry): LikeableCatalogEntry {
  const liked = entry.likedByMe;
  return {
    ...entry,
    likedByMe: !liked,
    likeCount: Math.max(0, entry.likeCount + (liked ? -1 : 1)),
  };
}

/**
 * 乐观翻转 catalog 缓存（详情条目与列表分页）中指定应用的 likedByMe，
 * 并同步 likeCount；不是目录条目的缓存数据（版本、风险说明等）原样保留。
 */
function flipCatalogLike(
  queryClient: QueryClient,
  applicationId: string,
): void {
  queryClient.setQueriesData<unknown>(
    { queryKey: ["catalog"] },
    (current: unknown) => {
      if (current === null || typeof current !== "object") return current;
      const record = current as { applicationId?: unknown; items?: unknown };
      if (record.applicationId === applicationId) {
        return isLikeableEntry(current) ? flipEntryLike(current) : current;
      }
      if (Array.isArray(record.items)) {
        return {
          ...record,
          items: record.items.map((item) =>
            isLikeableEntry(item) && item.applicationId === applicationId
              ? flipEntryLike(item)
              : item,
          ),
        };
      }
      return current;
    },
  );
}

export function useToggleLike(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateCatalog = useInvalidateCatalog();
  return useMutation({
    mutationFn: () => toggleLike(applicationId as string),
    onMutate: async () => {
      if (!applicationId) return;
      await queryClient.cancelQueries({ queryKey: ["catalog"] });
      flipCatalogLike(queryClient, applicationId);
    },
    onError: (error) => {
      if (applicationId) {
        // 反向翻转恢复乐观状态，并失效重取以服务端结果为准。
        flipCatalogLike(queryClient, applicationId);
        void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      }
      showErrorMessage(error, "点赞操作失败");
    },
    onSuccess: async () => {
      await invalidateCatalog();
      showSuccessMessage("点赞状态已更新");
    },
  });
}

export function useRateApplication(applicationId: string | undefined) {
  const invalidateCatalog = useInvalidateCatalog();
  return useMutation({
    mutationFn: (stars: number) =>
      rateApplication(applicationId as string, stars),
    onError: (error) => showErrorMessage(error, "评分操作失败"),
    onSuccess: async () => {
      await invalidateCatalog();
      showSuccessMessage("评分已更新");
    },
  });
}

export function useRatings(
  applicationId: string | undefined,
  page: number = 1,
  pageSize: number = 20,
) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => listRatings(applicationId as string, page, pageSize),
    queryKey: ["interactions", "ratings", applicationId, page, pageSize],
  });
}

export function useComments(
  applicationId: string | undefined,
  page: number = 1,
  pageSize: number = 20,
) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => listComments(applicationId as string, page, pageSize),
    queryKey: ["interactions", "comments", applicationId, page, pageSize],
  });
}

export function useHideComment(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      hideComment(applicationId as string, commentId),
    onError: (error) => showErrorMessage(error, "隐藏评论失败"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["interactions", "comments", applicationId],
      });
      showSuccessMessage("评论已隐藏");
    },
  });
}

export function useReportComment(applicationId: string | undefined) {
  return useMutation({
    mutationFn: (input: { commentId: string; reason: string }) =>
      reportComment(applicationId as string, input.commentId, {
        reason: input.reason,
      }),
    onError: (error) => showErrorMessage(error, "举报提交失败"),
    onSuccess: () => showSuccessMessage("举报已提交，感谢反馈"),
  });
}

export function useRestoreComment(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      restoreComment(applicationId as string, commentId),
    onError: (error) => showErrorMessage(error, "恢复评论失败"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["interactions", "comments", applicationId],
      });
      showSuccessMessage("评论已恢复");
    },
  });
}

export function useCreateComment(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentCommentId?: string | null; body: string }) =>
      createComment(applicationId as string, input),
    onError: (error) => showErrorMessage(error, "发表评论失败"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["interactions", "comments", applicationId],
      });
      showSuccessMessage("评论已发表");
    },
  });
}

export function useCreateFeedback(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: "bug" | "suggestion" | "content_issue";
      body: string;
    }) => createFeedback(applicationId as string, input),
    onError: (error) => showErrorMessage(error, "提交反馈失败"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["interactions", "feedback", applicationId],
      });
      showSuccessMessage("反馈已提交");
    },
  });
}

export function useMyFeedback(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => listMyFeedback(applicationId as string),
    queryKey: ["interactions", "feedback", applicationId],
  });
}

/** 所有者/维护者查看应用全部反馈。 */
export function useApplicationFeedback(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => listApplicationFeedback(applicationId as string),
    queryKey: ["interactions", "feedback", applicationId, "all"],
  });
}

/** 所有者/维护者更新反馈处理状态。 */
export function useUpdateFeedbackStatus(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      feedbackId: string;
      status: "open" | "in_progress" | "resolved" | "closed";
      resolution: string;
    }) =>
      updateFeedbackStatus(applicationId as string, input.feedbackId, input),
    onError: (error) => showErrorMessage(error, "更新反馈状态失败"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["interactions", "feedback", applicationId],
      });
      showSuccessMessage("反馈状态已更新");
    },
  });
}
