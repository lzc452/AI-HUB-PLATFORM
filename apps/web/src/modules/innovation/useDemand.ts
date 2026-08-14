import type { DemandStatus } from "@ai-hub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addDemandComment,
  addDemandCollaborator,
  addDemandProgress,
  advanceDemandStatus,
  claimDemand,
  confirmDemandClaim,
  confirmDemandPriority,
  createApplicationFromDemand,
  createDemandDraft,
  createDemandPilot,
  deleteDemandAttachment,
  getDemand,
  likeDemand,
  likeDemandComment,
  listDemandApplications,
  listDemandAttachments,
  listDemandClaimProposals,
  listDemandCollaborators,
  listDemandComments,
  listDemandProgress,
  listDemandPilots,
  listDemandReports,
  listDemands,
  lookupAnonymousAuthor,
  releaseDemandClaim,
  removeDemandApplication,
  removeDemandCollaborator,
  linkDemandApplication,
  mergeDemand,
  reportDemand,
  resolveDemandReport,
  reviewDemand,
  setDemandPriority,
  submitDemandClaimProposal,
  submitDemandForReview,
  updateDemandDraft,
  updateDemandCollaboratorRole,
  updateDemandPilot,
  uploadDemandAttachment,
  withdrawDemandClaimProposal,
  type DemandListQuery,
} from "./demand.client";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";

const demandKeys = {
  all: ["demands"] as const,
  comments: (demandId?: string) => ["demands", "comments", demandId] as const,
  detail: (demandId?: string) => ["demands", "detail", demandId] as const,
  list: (query: DemandListQuery) => ["demands", "list", query] as const,
};

type OptimisticDemand = {
  likedByCurrentActor?: boolean;
  likeCount: number;
};

type OptimisticComment = {
  commentId: string;
  likedByCurrentActor?: boolean;
  likeCount: number;
};

export function useDemandList(query: DemandListQuery = {}) {
  return useQuery({
    queryFn: () => listDemands(query),
    queryKey: demandKeys.list(query),
  });
}

export function useDemand(demandId: string | undefined) {
  return useQuery({
    enabled: Boolean(demandId),
    queryFn: () => getDemand(demandId as string),
    queryKey: demandKeys.detail(demandId),
  });
}

export function useDemandComments(demandId: string | undefined) {
  return useQuery({
    enabled: Boolean(demandId),
    queryFn: () => listDemandComments(demandId as string),
    queryKey: demandKeys.comments(demandId),
  });
}

function invalidateDemand(
  queryClient: ReturnType<typeof useQueryClient>,
  demandId?: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: demandKeys.all }),
    demandId
      ? queryClient.invalidateQueries({ queryKey: demandKeys.detail(demandId) })
      : Promise.resolve(),
    demandId
      ? queryClient.invalidateQueries({
          queryKey: demandKeys.comments(demandId),
        })
      : Promise.resolve(),
  ]);
}

export function useLikeDemand(demandId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => likeDemand(demandId as string),
    onMutate: async () => {
      if (!demandId) return undefined;
      await queryClient.cancelQueries({
        queryKey: demandKeys.detail(demandId),
      });
      const previous = queryClient.getQueryData(demandKeys.detail(demandId));
      queryClient.setQueryData(
        demandKeys.detail(demandId),
        (current: OptimisticDemand | undefined) => {
          if (!current) return current;
          const liked = Boolean(current.likedByCurrentActor);
          return {
            ...current,
            likedByCurrentActor: !liked,
            likeCount: Math.max(0, current.likeCount + (liked ? -1 : 1)),
          };
        },
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (demandId && context?.previous) {
        queryClient.setQueryData(demandKeys.detail(demandId), context.previous);
      }
      showErrorMessage(error, "需求点赞失败");
    },
    onSuccess: async () => {
      await invalidateDemand(queryClient, demandId);
    },
  });
}

export function useAddDemandComment(demandId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: string | { body: string; parentCommentId?: string | null },
    ) =>
      addDemandComment(
        demandId as string,
        typeof input === "string" ? input : input.body,
        typeof input === "string" ? null : (input.parentCommentId ?? null),
      ),
    onError: (error) => showErrorMessage(error, "讨论提交失败"),
    onSuccess: async () => {
      await invalidateDemand(queryClient, demandId);
      showSuccessMessage("讨论已提交");
    },
  });
}

export function useLikeDemandComment(demandId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      likeDemandComment(demandId as string, commentId),
    onMutate: async (commentId) => {
      if (!demandId) return undefined;
      await queryClient.cancelQueries({
        queryKey: demandKeys.comments(demandId),
      });
      const previous = queryClient.getQueryData(demandKeys.comments(demandId));
      queryClient.setQueryData(
        demandKeys.comments(demandId),
        (comments: OptimisticComment[] | undefined) =>
          comments?.map((comment) =>
            comment.commentId === commentId
              ? {
                  ...comment,
                  likedByCurrentActor: !comment.likedByCurrentActor,
                  likeCount: Math.max(
                    0,
                    comment.likeCount + (comment.likedByCurrentActor ? -1 : 1),
                  ),
                }
              : comment,
          ),
      );
      return { previous };
    },
    onError: (error, _commentId, context) => {
      if (demandId && context?.previous) {
        queryClient.setQueryData(
          demandKeys.comments(demandId),
          context.previous,
        );
      }
      showErrorMessage(error, "评论点赞失败");
    },
    onSuccess: async () => {
      await invalidateDemand(queryClient, demandId);
    },
  });
}

export function useCreateDemandDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDemandDraft,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: demandKeys.all });
      showSuccessMessage("需求草稿已保存");
    },
    onError: (error) => showErrorMessage(error, "保存需求草稿失败"),
  });
}

export function useUpdateDemandDraft(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateDemandDraft>[1]) =>
      updateDemandDraft(demandId as string, input),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "保存需求失败"),
  });
}

export function useSubmitDemandForReview(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitDemandForReview(demandId as string),
    onSuccess: async () => {
      await invalidateDemand(queryClient, demandId);
      showSuccessMessage("需求已提交审核");
    },
    onError: (error) => showErrorMessage(error, "提交审核失败"),
  });
}

export function useReviewDemand(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reviewDemand>[1]) =>
      reviewDemand(demandId as string, input),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "审核操作失败"),
  });
}

export function useClaimDemand(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedVersion?: number) =>
      claimDemand(demandId as string, expectedVersion),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "认领需求失败"),
  });
}

export function useAdvanceDemandStatus(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      status: DemandStatus;
      expectedVersion: number;
      reason?: string;
    }) =>
      advanceDemandStatus(
        demandId as string,
        input.status,
        input.expectedVersion,
        input.reason,
      ),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "推进需求状态失败"),
  });
}

export function useSetDemandPriority(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof setDemandPriority>[1]) =>
      setDemandPriority(demandId as string, input),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "保存优先级失败"),
  });
}

export function useConfirmDemandPriority(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof confirmDemandPriority>[1]) =>
      confirmDemandPriority(demandId as string, input),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "确认优先级失败"),
  });
}

export function useDemandClaimProposals(demandId?: string, enabled = false) {
  return useQuery({
    enabled: Boolean(demandId) && enabled,
    queryKey: ["demands", "claim-proposals", demandId],
    queryFn: () => listDemandClaimProposals(demandId as string),
  });
}

export function useSubmitDemandClaimProposal(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: Parameters<typeof submitDemandClaimProposal>[1]) =>
      submitDemandClaimProposal(demandId as string, input),
    "提交认领方案失败",
  );
}

export function useWithdrawDemandClaimProposal(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: { proposalId: string }) =>
      withdrawDemandClaimProposal(demandId as string, input.proposalId),
    "撤回认领方案失败",
  );
}

export function useConfirmDemandClaim(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: { proposalId: string; expectedVersion: number }) =>
      confirmDemandClaim(demandId as string, input.proposalId, input.expectedVersion),
    "确认认领方案失败",
  );
}

export function useReleaseDemandClaim(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: { expectedVersion: number; reason?: string }) =>
      releaseDemandClaim(demandId as string, input.expectedVersion, input.reason),
    "解除认领失败",
  );
}

export function useDemandAttachments(demandId?: string, enabled = false) {
  return useQuery({
    enabled: Boolean(demandId) && enabled,
    queryKey: ["demands", "attachments", demandId],
    queryFn: () => listDemandAttachments(demandId as string),
  });
}

export function useUploadDemandAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadDemandAttachment(file),
    onError: (error) => showErrorMessage(error, "附件上传失败"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["demands", "attachments"] });
    },
  });
}

export function useDeleteDemandAttachment(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      deleteDemandAttachment(demandId as string, attachmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["demands", "attachments", demandId],
      });
    },
    onError: (error) => showErrorMessage(error, "删除附件失败"),
  });
}

export function useReportDemand(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reportDemand>[1]) =>
      reportDemand(demandId as string, input),
    onSuccess: async () => {
      await invalidateDemand(queryClient, demandId);
      showSuccessMessage("举报已提交");
    },
    onError: (error) => showErrorMessage(error, "举报提交失败"),
  });
}

export function useDemandGovernanceData(demandId?: string, enabled = false) {
  const options = { enabled: Boolean(demandId) && enabled };
  return {
    applications: useQuery({
      ...options,
      queryKey: ["demands", "applications", demandId],
      queryFn: () => listDemandApplications(demandId as string),
    }),
    collaborators: useQuery({
      ...options,
      queryKey: ["demands", "collaborators", demandId],
      queryFn: () => listDemandCollaborators(demandId as string),
    }),
    progress: useQuery({
      ...options,
      queryKey: ["demands", "progress", demandId],
      queryFn: () => listDemandProgress(demandId as string),
    }),
    pilots: useQuery({
      ...options,
      queryKey: ["demands", "pilots", demandId],
      queryFn: () => listDemandPilots(demandId as string),
    }),
    reports: useQuery({
      ...options,
      queryKey: ["demands", "reports", demandId],
      queryFn: () => listDemandReports(demandId as string),
    }),
  };
}

function useGovernanceMutation<T>(
  demandId: string | undefined,
  mutationFn: (input: T) => Promise<unknown>,
  errorMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, errorMessage),
  });
}

export function useAddDemandCollaborator(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: Parameters<typeof addDemandCollaborator>[1]) =>
      addDemandCollaborator(demandId as string, input),
    "添加协作者失败",
  );
}

export function useUpdateDemandCollaboratorRole(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (
      input: Parameters<typeof updateDemandCollaboratorRole>[2] & {
        employeeId: string;
      },
    ) =>
      updateDemandCollaboratorRole(demandId as string, input.employeeId, {
        role: input.role,
        expectedVersion: input.expectedVersion,
      }),
    "调整协作者角色失败",
  );
}

export function useAddDemandProgress(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: Parameters<typeof addDemandProgress>[1]) =>
      addDemandProgress(demandId as string, input),
    "新增进展失败",
  );
}

export function useCreateDemandPilot(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: Parameters<typeof createDemandPilot>[1]) =>
      createDemandPilot(demandId as string, input),
    "创建试点失败",
  );
}

export function useUpdateDemandPilot(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: {
      pilotId: string;
      status?: string;
      outcome?: string;
      endsAt?: string | null;
    }) => updateDemandPilot(demandId as string, input.pilotId, input),
    "更新试点失败",
  );
}

export function useLinkDemandApplication(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: Parameters<typeof linkDemandApplication>[1]) =>
      linkDemandApplication(demandId as string, input),
    "关联应用失败",
  );
}

export function useCreateApplicationFromDemand(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: Parameters<typeof createApplicationFromDemand>[1]) =>
      createApplicationFromDemand(demandId as string, input),
    "从需求创建应用失败",
  );
}

export function useMergeDemand(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: Parameters<typeof mergeDemand>[1]) =>
      mergeDemand(demandId as string, input),
    "合并需求失败",
  );
}

export function useResolveDemandReport(demandId?: string) {
  return useGovernanceMutation(
    demandId,
    (input: {
      reportId: string;
      status: "dismissed" | "hidden" | "restored";
    }) => resolveDemandReport(demandId as string, input.reportId, input.status),
    "处理举报失败",
  );
}

export function useLookupAnonymousAuthor(demandId?: string) {
  return useMutation({
    mutationFn: (input: { commentId: string }) =>
      lookupAnonymousAuthor(demandId as string, input.commentId),
    onSuccess: ({ employeeId }) =>
      showSuccessMessage(`匿名评论作者：${employeeId}`),
    onError: (error) => showErrorMessage(error, "追溯匿名作者失败"),
  });
}

export function useRemoveDemandCollaborator(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { employeeId: string; expectedVersion?: number }) =>
      removeDemandCollaborator(
        demandId as string,
        input.employeeId,
        input.expectedVersion,
      ),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "移除协作者失败"),
  });
}

export function useRemoveDemandApplication(demandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { applicationId: string; expectedVersion?: number }) =>
      removeDemandApplication(
        demandId as string,
        input.applicationId,
        input.expectedVersion,
      ),
    onSuccess: async () => invalidateDemand(queryClient, demandId),
    onError: (error) => showErrorMessage(error, "解除应用关联失败"),
  });
}
