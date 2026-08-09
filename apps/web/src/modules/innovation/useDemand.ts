import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  showErrorMessage,
  showSuccessMessage,
} from "../../shared/ui/message";
import {
  addDemandComment,
  getDemand,
  likeDemand,
  listDemandComments,
  listDemands,
} from "./demand.client";

export function useDemandList(query: string) {
  return useQuery({
    queryFn: () => listDemands(query),
    queryKey: ["demands", "list", query],
  });
}

export function useDemand(demandId: string | undefined) {
  return useQuery({
    enabled: Boolean(demandId),
    queryFn: () => getDemand(demandId as string),
    queryKey: ["demands", "detail", demandId],
  });
}

export function useDemandComments(demandId: string | undefined) {
  return useQuery({
    enabled: Boolean(demandId),
    queryFn: () => listDemandComments(demandId as string),
    queryKey: ["demands", "comments", demandId],
  });
}

export function useLikeDemand(demandId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => likeDemand(demandId as string),
    onError: (error) => showErrorMessage(error, "需求点赞失败"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["demands"] });
      showSuccessMessage("需求点赞成功");
    },
  });
}

export function useAddDemandComment(demandId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addDemandComment(demandId as string, body),
    onError: (error) => showErrorMessage(error, "讨论提交失败"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["demands"] });
      showSuccessMessage("讨论已提交");
    },
  });
}
