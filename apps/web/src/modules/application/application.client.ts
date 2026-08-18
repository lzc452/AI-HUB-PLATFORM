import type {
  ApplicationAdminKpis,
  ApplicationStatus,
  DeliveryChannel,
  DeliveryTarget,
} from "@ai-hub/contracts";

import { apiFetch, apiFetchBlob, apiUpload } from "../../shared/api/client";

export interface ApplicationRecord {
  applicationId: string;
  ownerEmployeeId: string;
  maintainerEmployeeId: string;
  departmentId: string;
  name: string;
  summary: string;
  status: ApplicationStatus;
  currentVersionId: string | null;
}

export interface ApplicationVersionRecord {
  applicationVersionId: string;
  applicationId: string;
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string | null;
  /** 制品是否已签名（源自后端关联 upload 记录；无制品或未知时为 null）。 */
  signed: boolean | null;
  scanStatus: "pending" | "passed" | "failed";
  createdByEmployeeId: string;
  createdAt: string;
}

export interface DeliveryRecord {
  deliveryId: string;
  applicationId: string;
  channel: DeliveryChannel;
  entryUrl: string;
  minClientVersion: string | null;
  enabled: boolean;
  targets?: DeliveryTarget[];
}

export interface ReviewRecord {
  reviewId: string;
  applicationId: string;
  applicationVersionId: string;
  reviewerEmployeeId: string;
  applicationOwnerEmployeeId: string;
  decision: "approve" | "reject" | "request_changes";
  comment: string;
  createdAt: string;
}

export interface ReviewQueueRecord {
  reviewQueueId: string;
  applicationId: string;
  applicationVersionId: string;
  status: "available" | "claimed";
  claimedByEmployeeId: string | null;
  claimedAt: string | null;
  slaDueAt: string;
  createdAt: string;
  slaStatus: "on_time" | "overdue";
}

export interface ApplicationWorkspace {
  application: ApplicationRecord;
  ownerName: string;
  maintainerName: string;
  departmentName: string;
  updatedAt: string;
  versions: ApplicationVersionRecord[];
  deliveries: DeliveryRecord[];
  reviews: ReviewRecord[];
  reviewQueue: ReviewQueueRecord | null;
  assets: AssetRecord[];
}

export interface CreatorApplicationRecord {
  applicationId: string;
  name: string;
  status: ApplicationStatus;
  categoryId: string;
  tagIds: string[];
  publishedAt: string | null;
  ratingAverage: number | null;
  likeCount: number;
}

export interface CreatorApplicationList {
  items: CreatorApplicationRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export type ValidationCheckStatus =
  | "passed"
  | "safe"
  | "warning"
  | "info"
  | "failed";

export interface ValidationCheckRecord {
  validationCheckId: string;
  applicationVersionId: string;
  checkCode: string;
  label: string;
  status: ValidationCheckStatus;
  detail: string | null;
  createdAt: string;
}

export interface CreatorSummary {
  versionDiff: {
    fromVersion: string;
    toVersion: string;
    changedFields: string[];
  };
  validationReport: {
    /** 无任何检查点时后端返回 no_record（不虚构通过/失败）。 */
    status: "passed" | "no_record";
    checks: {
      code: string;
      label: string;
      status: ValidationCheckStatus;
      detail: string | null;
    }[];
  };
  metrics: {
    redirectCount: number;
    downloadCount: number;
    qrDisplayCount: number;
    likeCount: number;
    ratingAverage: number | null;
    reviewCount: number;
  };
}

function applicationsPath(applicationId: string): string {
  return `/internal/applications/${encodeURIComponent(applicationId)}`;
}

export function getApplication(
  applicationId: string,
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(applicationsPath(applicationId));
}

export function getAdminApplicationKpis(): Promise<ApplicationAdminKpis> {
  return apiFetch<ApplicationAdminKpis>("/internal/applications/admin-kpis");
}

export function getApplicationWorkspace(
  applicationId: string,
): Promise<ApplicationWorkspace> {
  return apiFetch<ApplicationWorkspace>(
    `${applicationsPath(applicationId)}/workspace`,
  );
}

export function getApplicationVersions(
  applicationId: string,
): Promise<ApplicationVersionRecord[]> {
  return apiFetch<ApplicationVersionRecord[]>(
    `${applicationsPath(applicationId)}/versions`,
  );
}

export function getApplicationDeliveries(
  applicationId: string,
): Promise<DeliveryRecord[]> {
  return apiFetch<DeliveryRecord[]>(
    `${applicationsPath(applicationId)}/deliveries`,
  );
}

export function getApplicationReviews(
  applicationId: string,
): Promise<ReviewRecord[]> {
  return apiFetch<ReviewRecord[]>(`${applicationsPath(applicationId)}/reviews`);
}

export function getPublishedVersion(
  applicationId: string,
): Promise<ApplicationVersionRecord> {
  return apiFetch<ApplicationVersionRecord>(
    `${applicationsPath(applicationId)}/published-version`,
  );
}

export function getValidationChecks(
  applicationVersionId: string,
): Promise<ValidationCheckRecord[]> {
  return apiFetch<ValidationCheckRecord[]>(
    `/internal/applications/versions/${encodeURIComponent(applicationVersionId)}/validation-checks`,
  );
}

export function getCreatorSummary(
  applicationId: string,
): Promise<CreatorSummary> {
  return apiFetch<CreatorSummary>(
    `/internal/creator/applications/${encodeURIComponent(applicationId)}/summary`,
  );
}

export function getCreatorApplications(): Promise<CreatorApplicationList> {
  return apiFetch<CreatorApplicationList>("/internal/creator/applications");
}

/** 撤回/下架应用；后端要求携带撤回原因。 */
export function withdrawApplication(
  applicationId: string,
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(
    `${applicationsPath(applicationId)}/withdraw`,
    {
      body: JSON.stringify({ reason: "创作者主动撤回" }),
      method: "POST",
    },
  );
}

export function archiveApplication(
  applicationId: string,
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(
    `${applicationsPath(applicationId)}/archive`,
    {
      body: JSON.stringify({}),
      method: "POST",
    },
  );
}

/** 删除草稿应用（仅负责人可删除 status=draft 的应用）。 */
export function deleteApplication(applicationId: string): Promise<void> {
  return apiFetch<void>(applicationsPath(applicationId), {
    method: "DELETE",
  });
}

/** 移交责任人（负责人本人或应用管理员）。 */
export function transferApplicationOwner(
  applicationId: string,
  ownerEmployeeId: string,
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(
    `${applicationsPath(applicationId)}/transfer`,
    {
      method: "POST",
      body: JSON.stringify({ ownerEmployeeId }),
    },
  );
}

export function createApplication(input: {
  name: string;
  summary: string;
}): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>("/internal/applications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitApplicationReview(
  applicationVersionId: string,
  options?: { acceptUnsigned?: boolean },
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(
    `/internal/applications/versions/${encodeURIComponent(applicationVersionId)}/submit-review`,
    {
      method: "POST",
      // 未签名制品需显式确认接受风险后携带 acceptUnsigned（规格 §5.5）。
      ...(options?.acceptUnsigned === true
        ? { body: JSON.stringify({ acceptUnsigned: true }) }
        : {}),
    },
  );
}

// ---------------------------------------------------------------------------
// 发布链：创建版本 / 交付 / 审核 / 发布 / 上传 / 资产
// ---------------------------------------------------------------------------

export interface CreateVersionInput {
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string;
  /** 制品未签名（signed=false）时，是否已确认接受风险（后端强制校验）。 */
  acceptUnsigned?: boolean;
}

export function createVersion(
  applicationId: string,
  input: CreateVersionInput,
): Promise<ApplicationVersionRecord> {
  return apiFetch<ApplicationVersionRecord>(
    `${applicationsPath(applicationId)}/versions`,
    {
      method: "POST",
      body: JSON.stringify({ ...input, scanStatus: "passed" }),
    },
  );
}

export interface ConfigureDeliveryInput {
  entryUrl: string;
  minClientVersion?: string | null;
  enabled: boolean;
  /** 交付目标（desktop/mobile/mini_program 渠道；web 渠道不支持）。 */
  targets?: DeliveryTarget[];
}

export function configureDelivery(
  applicationId: string,
  channel: DeliveryChannel,
  input: ConfigureDeliveryInput,
): Promise<DeliveryRecord> {
  return apiFetch<DeliveryRecord>(
    `${applicationsPath(applicationId)}/deliveries/${channel}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function claimReview(
  applicationVersionId: string,
): Promise<ReviewQueueRecord> {
  return apiFetch<ReviewQueueRecord>(
    `/internal/applications/versions/${encodeURIComponent(applicationVersionId)}/claim-review`,
    { method: "POST" },
  );
}

export function releaseReview(
  applicationVersionId: string,
): Promise<ReviewQueueRecord> {
  return apiFetch<ReviewQueueRecord>(
    `/internal/applications/versions/${encodeURIComponent(applicationVersionId)}/release-review`,
    { method: "POST" },
  );
}

export function reviewApplicationVersion(
  applicationVersionId: string,
  input: {
    decision: "approve" | "reject" | "request_changes";
    comment: string;
  },
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(
    `/internal/applications/versions/${encodeURIComponent(applicationVersionId)}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getReviewQueue(
  applicationVersionId: string,
): Promise<ReviewQueueRecord> {
  return apiFetch<ReviewQueueRecord>(
    `/internal/applications/versions/${encodeURIComponent(applicationVersionId)}/review-queue`,
  );
}

export function publishApplication(
  applicationId: string,
  applicationVersionId: string,
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(
    `${applicationsPath(applicationId)}/publish`,
    { method: "POST", body: JSON.stringify({ applicationVersionId }) },
  );
}

// ---- artifact 上传 ----

export interface ArtifactUploadRecord {
  uploadId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: "uploading" | "verifying" | "completed" | "failed";
  scanStatus: "pending" | "passed" | "failed";
  sha256: string | null;
  signature: string | null;
  /** 制品是否已签名；false 表示未签名，创建版本前必须显式确认风险。 */
  signed: boolean;
  errorCode: string | null;
  verificationAttempts: number;
  expiresAt: string;
}

export function createArtifactUpload(
  applicationId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number },
): Promise<ArtifactUploadRecord> {
  return apiFetch<ArtifactUploadRecord>(
    `${applicationsPath(applicationId)}/artifact-uploads`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

/** 上传 artifact 内容（raw body），带进度回调。 */
export function uploadArtifactContent(
  applicationId: string,
  uploadId: string,
  content: Blob | ArrayBuffer,
  onProgress?: (percent: number) => void,
): Promise<ArtifactUploadRecord> {
  return apiUpload<ArtifactUploadRecord>(
    `/internal/applications/${encodeURIComponent(applicationId)}/artifact-uploads/${encodeURIComponent(uploadId)}/content`,
    content,
    onProgress,
  );
}

export function completeArtifactUpload(
  applicationId: string,
  uploadId: string,
  signature: string,
): Promise<ArtifactUploadRecord> {
  return apiFetch<ArtifactUploadRecord>(
    `${applicationsPath(applicationId)}/artifact-uploads/${encodeURIComponent(uploadId)}/complete`,
    { method: "POST", body: JSON.stringify({ signature }) },
  );
}

export function getArtifactUploadStatus(
  applicationId: string,
  uploadId: string,
): Promise<ArtifactUploadRecord> {
  return apiFetch<ArtifactUploadRecord>(
    `${applicationsPath(applicationId)}/artifact-uploads/${encodeURIComponent(uploadId)}`,
  );
}

// ---- 资产 ----

export interface AssetRecord {
  assetId: string;
  assetType: "icon" | "screenshot" | "attachment";
  name: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  scanStatus: "pending" | "passed" | "failed";
  createdAt: string;
}

export function listAssets(applicationId: string): Promise<AssetRecord[]> {
  return apiFetch<AssetRecord[]>(`${applicationsPath(applicationId)}/assets`);
}

/** 读取资产内容（图标/截图/附件），供详情页图片预览使用。 */
export async function getAssetContent(
  applicationId: string,
  assetId: string,
): Promise<Blob> {
  const { blob } = await apiFetchBlob(
    `${applicationsPath(applicationId)}/assets/${encodeURIComponent(assetId)}/content`,
  );
  return blob;
}

export function createAsset(
  applicationId: string,
  input: {
    assetType: "icon" | "screenshot" | "attachment";
    name: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    sha256?: string | null;
    sortOrder?: number;
  },
): Promise<AssetRecord> {
  return apiFetch<AssetRecord>(`${applicationsPath(applicationId)}/assets`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAsset(
  applicationId: string,
  assetId: string,
): Promise<void> {
  return apiFetch<void>(
    `${applicationsPath(applicationId)}/assets/${encodeURIComponent(assetId)}`,
    { method: "DELETE" },
  );
}
