import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";
import {
  hideComment,
  listComments,
  listRatings,
  rateApplication,
  restoreComment,
  toggleLike,
} from "./interaction.client";

function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["catalog"] });
}

export function useToggleLike(applicationId: string | undefined) {
  const invalidateCatalog = useInvalidateCatalog();
  return useMutation({
    mutationFn: () => toggleLike(applicationId as string),
    onError: (error) => showErrorMessage(error, "点赞操作失败"),
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
