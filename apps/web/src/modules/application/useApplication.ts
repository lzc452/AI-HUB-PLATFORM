import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { DeliveryChannel } from "@ai-hub/contracts";
import { ApiError } from "../../shared/api/client";

import {
  archiveApplication,
  claimReview,
  completeArtifactUpload,
  configureDelivery,
  createArtifactUpload,
  createVersion,
  deleteApplication,
  deleteAsset,
  getAssetContent,
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
  getValidationChecks,
  getVersionDiff,
  getVersionSnapshot,
  listAssets,
  publishApplication,
  releaseReview,
  reviewApplicationVersion,
  submitApplicationReview,
  transferApplicationOwner,
  withdrawApplication,
  withdrawApplicationReview,
  type ArtifactUploadRecord,
  type CreateVersionInput,
  type ConfigureDeliveryInput,
} from "./application.client";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";
import { toApplicationErrorMessage } from "./application.errors";

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

export function usePublishedVersion(
  applicationId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    enabled: Boolean(applicationId) && (options?.enabled ?? true),
    queryFn: () => getPublishedVersion(applicationId as string),
    queryKey: ["applications", "published-version", applicationId],
  });
}

export function useVersionSnapshot(
  applicationId: string | undefined,
  versionId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    enabled:
      Boolean(applicationId) &&
      Boolean(versionId) &&
      (options?.enabled ?? true),
    queryFn: () =>
      getVersionSnapshot(applicationId as string, versionId as string),
    queryKey: ["applications", "version-snapshot", applicationId, versionId],
  });
}

export function useVersionDiff(
  applicationId: string | undefined,
  fromVersionId: string | undefined,
  toVersionId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    enabled:
      Boolean(applicationId) &&
      Boolean(fromVersionId) &&
      Boolean(toVersionId) &&
      (options?.enabled ?? true),
    queryFn: () =>
      getVersionDiff(
        applicationId as string,
        fromVersionId as string,
        toVersionId as string,
      ),
    queryKey: [
      "applications",
      "version-diff",
      applicationId,
      fromVersionId,
      toVersionId,
    ],
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

export function useDeleteApplication() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationId: string) => deleteApplication(applicationId),
    onError: (error) => showErrorMessage(error, "应用删除失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("应用已删除");
    },
  });
}

export function useTransferApplicationOwner() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (input: { applicationId: string; ownerEmployeeId: string }) =>
      transferApplicationOwner(input.applicationId, input.ownerEmployeeId),
    onError: (error) => showErrorMessage(error, "责任人移交失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("责任人已移交");
    },
  });
}

/** 拉取资产内容并生成可预览的 object URL（组件卸载时自动释放）。 */
export function useAssetImage(
  applicationId: string | undefined,
  assetId: string | undefined,
): { objectUrl: string | null; failed: boolean } {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (!applicationId || !assetId) {
      setObjectUrl(null);
      setFailed(false);
      return;
    }
    setObjectUrl(null);
    setFailed(false);
    void getAssetContent(applicationId, assetId)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [applicationId, assetId]);

  return { objectUrl, failed };
}

// ---------------------------------------------------------------------------
// 发布链 hooks
// ---------------------------------------------------------------------------

export function useCreateVersion(applicationId: string | undefined) {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (input: CreateVersionInput) =>
      createVersion(applicationId as string, input),
    onError: (error) =>
      showErrorMessage(toApplicationErrorMessage(error), "创建版本失败"),
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
    onError: (error) =>
      showErrorMessage(toApplicationErrorMessage(error), "保存交付配置失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("交付配置已保存");
    },
  });
}

export function useSubmitApplicationReview() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (input: {
      applicationVersionId: string;
      /** 制品未签名（signed=false）时，提交人已确认接受风险（规格 §5.5）。 */
      acceptUnsigned?: boolean;
    }) =>
      input.acceptUnsigned === true
        ? submitApplicationReview(input.applicationVersionId, {
            acceptUnsigned: true,
          })
        : submitApplicationReview(input.applicationVersionId),
    onError: (error) =>
      showErrorMessage(toApplicationErrorMessage(error), "提交版本审核失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("版本已提交审核");
    },
  });
}

/** 撤回待审核版本（in_review 应用行内操作）。 */
export function useWithdrawReview() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationVersionId: string) =>
      withdrawApplicationReview(applicationVersionId),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "REVIEW_NOT_PENDING") {
        // 审核已推进或已被他人处理，提示刷新后以最新状态重试。
        showErrorMessage(null, "该版本已不在审核中，请刷新后重试");
        return;
      }
      showErrorMessage(toApplicationErrorMessage(error), "撤回审核失败");
    },
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("已撤回审核");
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
    onError: (error) =>
      showErrorMessage(toApplicationErrorMessage(error), "发布失败"),
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

export function useValidationChecks(applicationVersionId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationVersionId),
    queryFn: () => getValidationChecks(applicationVersionId as string),
    queryKey: ["applications", "validation-checks", applicationVersionId],
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
    onError: (error) =>
      showErrorMessage(toApplicationErrorMessage(error), "创建上传会话失败"),
  });
  const complete = useMutation({
    mutationFn: ({
      uploadId,
      signature,
    }: {
      uploadId: string;
      signature: string;
    }) => completeArtifactUpload(applicationId as string, uploadId, signature),
    onError: (error) =>
      showErrorMessage(toApplicationErrorMessage(error), "完成上传失败"),
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
    // 制品校验由 worker 异步完成；仅在调用方提供 uploadId 时轮询。
    refetchInterval: 1_000,
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
