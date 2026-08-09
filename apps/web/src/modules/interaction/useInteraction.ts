import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  showErrorMessage,
  showSuccessMessage,
} from "../../shared/ui/message";
import { rateApplication, toggleLike } from "./interaction.client";

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
