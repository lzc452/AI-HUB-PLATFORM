import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeliveryChannel } from "@ai-hub/contracts";

import {
  archiveApplication,
  claimReview,
  completeArtifactUpload,
  configureDelivery,
  createArtifactUpload,
  createVersion,
  deleteAsset,
  getApplication,
  getApplicationWorkspace,
  getApplicationDeliveries,
  getApplicationReviews,
  getApplicationVersions,
  getArtifactUploadStatus,
  getCreatorApplications,
  getCreatorSummary,
  getPublishedVersion,
  getReviewQueue,
  listAssets,
  publishApplication,
  releaseReview,
  reviewApplicationVersion,
  type ArtifactUploadRecord,
  type CreateVersionInput,
  type ConfigureDeliveryInput,
  withdrawApplication,
} from "./application.client";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";

export function useApplication(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplication(applicationId as string),
    queryKey: ["applications", "detail", applicationId],
  });
}

export function useApplicationWorkspace(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationWorkspace(applicationId as string),
    queryKey: ["applications", "workspace", applicationId],
  });
}

export function useApplicationVersions(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationVersions(applicationId as string),
    queryKey: ["applications", "versions", applicationId],
  });
}

export function useApplicationDeliveries(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationDeliveries(applicationId as string),
    queryKey: ["applications", "deliveries", applicationId],
  });
}

export function useApplicationReviews(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationReviews(applicationId as string),
    queryKey: ["applications", "reviews", applicationId],
  });
}

export function usePublishedVersion(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getPublishedVersion(applicationId as string),
    queryKey: ["applications", "published-version", applicationId],
  });
}

export function useCreatorSummary(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getCreatorSummary(applicationId as string),
    queryKey: ["creator", "summary", applicationId],
  });
}

export function useCreatorApplications() {
  return useQuery({
    queryFn: getCreatorApplications,
    queryKey: ["creator", "applications"],
  });
}

/** 失效受 mutation 影响的全部缓存域：创作者列表、市场目录与应用管理。 */
function useInvalidateApplicationCaches() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["creator"] }),
      queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["applications"] }),
    ]);
  };
}

export function useWithdrawApplication() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationId: string) => withdrawApplication(applicationId),
    onError: (error) => showErrorMessage(error, "应用下架失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("应用已下架");
    },
  });
}

export function useArchiveApplication() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationId: string) => archiveApplication(applicationId),
    onError: (error) => showErrorMessage(error, "应用归档失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("应用已归档");
    },
  });
}

// ---------------------------------------------------------------------------
// 发布链 hooks
// ---------------------------------------------------------------------------

export function useCreateVersion(applicationId: string | undefined) {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (input: CreateVersionInput) =>
      createVersion(applicationId as string, input),
    onError: (error) => showErrorMessage(error, "创建版本失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("版本已创建");
    },
  });
}

export function useConfigureDelivery(applicationId: string | undefined) {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: ({
      channel,
      input,
    }: {
      channel: DeliveryChannel;
      input: ConfigureDeliveryInput;
    }) => configureDelivery(applicationId as string, channel, input),
    onError: (error) => showErrorMessage(error, "保存交付配置失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("交付配置已保存");
    },
  });
}

export function useClaimReview() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationVersionId: string) =>
      claimReview(applicationVersionId),
    onError: (error) => showErrorMessage(error, "认领审核失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("已认领审核");
    },
  });
}

export function useReleaseReview() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationVersionId: string) =>
      releaseReview(applicationVersionId),
    onError: (error) => showErrorMessage(error, "释放审核失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("已释放审核认领");
    },
  });
}

export function useReviewApplicationVersion() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: ({
      applicationVersionId,
      decision,
      comment,
    }: {
      applicationVersionId: string;
      decision: "approve" | "reject" | "request_changes";
      comment: string;
    }) => reviewApplicationVersion(applicationVersionId, { decision, comment }),
    onError: (error) => showErrorMessage(error, "审核提交失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("审核已提交");
    },
  });
}

export function usePublishApplication(applicationId: string | undefined) {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationVersionId: string) =>
      publishApplication(applicationId as string, applicationVersionId),
    onError: (error) => showErrorMessage(error, "发布失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("应用已发布到市场");
    },
  });
}

export function useReviewQueue(applicationVersionId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationVersionId),
    queryFn: () => getReviewQueue(applicationVersionId as string),
    queryKey: ["applications", "review-queue", applicationVersionId],
  });
}

export function useArtifactUpload(applicationId: string | undefined) {
  const invalidateCaches = useInvalidateApplicationCaches();
  const start = useMutation({
    mutationFn: (input: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }) => createArtifactUpload(applicationId as string, input),
    onError: (error) => showErrorMessage(error, "创建上传会话失败"),
  });
  const complete = useMutation({
    mutationFn: ({
      uploadId,
      signature,
    }: {
      uploadId: string;
      signature: string;
    }) => completeArtifactUpload(applicationId as string, uploadId, signature),
    onError: (error) => showErrorMessage(error, "完成上传失败"),
    onSuccess: async () => {
      await invalidateCaches();
    },
  });
  return { start, complete };
}

export function useArtifactUploadStatus(
  applicationId: string | undefined,
  uploadId: string | undefined,
) {
  return useQuery({
    enabled: Boolean(applicationId) && Boolean(uploadId),
    queryFn: () =>
      getArtifactUploadStatus(
        applicationId as string,
        uploadId as string,
      ) as Promise<ArtifactUploadRecord>,
    queryKey: ["applications", "artifact-upload", applicationId, uploadId],
  });
}

export function useAssets(applicationId: string | undefined) {
  const query = useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => listAssets(applicationId as string),
    queryKey: ["applications", "assets", applicationId],
  });
  const invalidateCaches = useInvalidateApplicationCaches();
  const remove = useMutation({
    mutationFn: (assetId: string) =>
      deleteAsset(applicationId as string, assetId),
    onError: (error) => showErrorMessage(error, "删除资产失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("资产已删除");
    },
  });
  return { query, remove };
}
