import type {
  ApplicationDraft,
  ApplicationDraftRecord,
  UploadKind,
} from "@ai-hub/contracts";

import { apiFetch, apiUpload } from "../../shared/api/client";

// ---------------------------------------------------------------------------
// 草稿读写
// ---------------------------------------------------------------------------

function draftPath(applicationId: string): string {
  return `/internal/applications/${encodeURIComponent(applicationId)}/draft`;
}

/** 创建应用草稿（拿 applicationId，后续各步保存到该应用）。 */
export function createApplicationDraft(): Promise<{ applicationId: string }> {
  return apiFetch<{ applicationId: string }>("/internal/applications", {
    method: "POST",
    body: JSON.stringify({ name: "", summary: "" }),
  });
}

export function getApplicationDraft(
  applicationId: string,
): Promise<ApplicationDraftRecord> {
  return apiFetch<ApplicationDraftRecord>(draftPath(applicationId));
}

export function saveApplicationDraft(
  applicationId: string,
  draft: ApplicationDraft,
): Promise<ApplicationDraftRecord> {
  return apiFetch<ApplicationDraftRecord>(draftPath(applicationId), {
    method: "PUT",
    body: JSON.stringify(draft),
  });
}

/** 提交草稿进入审核；校验失败返回 400 并携带 issues 列表。 */
export function submitApplicationDraft(applicationId: string): Promise<{
  applicationId: string;
  status: string;
}> {
  return apiFetch<{ applicationId: string; status: string }>(
    `/internal/applications/${encodeURIComponent(applicationId)}/submit-draft`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// 资产上传（复用 artifact-upload + asset 端点）
// ---------------------------------------------------------------------------

export interface UploadSession {
  uploadId: string;
  kind: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: "uploading" | "completed" | "failed";
  scanStatus: "pending" | "passed" | "failed";
  sha256: string | null;
  errorCode: string | null;
  assetId: string | null;
}

export interface AssetRecord {
  assetId: string;
  assetType: "icon" | "screenshot" | "cover" | "attachment" | "qr";
  name: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  scanStatus: "pending" | "passed" | "failed";
  createdAt: string;
}

export function initUpload(
  applicationId: string,
  input: {
    kind: UploadKind;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<UploadSession> {
  return apiFetch<UploadSession>(
    `/internal/applications/${encodeURIComponent(applicationId)}/uploads`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function uploadContent(
  applicationId: string,
  uploadId: string,
  content: Blob | ArrayBuffer,
  onProgress?: (percent: number) => void,
): Promise<UploadSession> {
  return apiUpload<UploadSession>(
    `/internal/applications/${encodeURIComponent(applicationId)}/uploads/${encodeURIComponent(uploadId)}/content`,
    content,
    onProgress,
  );
}

export function completeUpload(
  applicationId: string,
  uploadId: string,
): Promise<UploadSession> {
  return apiFetch<UploadSession>(
    `/internal/applications/${encodeURIComponent(applicationId)}/uploads/${encodeURIComponent(uploadId)}/complete`,
    { method: "POST", body: JSON.stringify({ signature: "" }) },
  );
}

export function listAssets(applicationId: string): Promise<AssetRecord[]> {
  return apiFetch<AssetRecord[]>(
    `/internal/applications/${encodeURIComponent(applicationId)}/assets`,
  );
}

export function deleteAsset(
  applicationId: string,
  assetId: string,
): Promise<void> {
  return apiFetch<void>(
    `/internal/applications/${encodeURIComponent(applicationId)}/assets/${encodeURIComponent(assetId)}`,
    { method: "DELETE" },
  );
}

/** 上传单个资产文件并返回资产 ID（串行：init → upload → complete，complete 自动创建 asset）。 */
export async function uploadAsset(
  applicationId: string,
  kind: UploadKind,
  file: File,
): Promise<{ assetId: string }> {
  const session = await initUpload(applicationId, {
    kind,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
  await uploadContent(applicationId, session.uploadId, file);
  const completed = await completeUpload(applicationId, session.uploadId);
  return { assetId: completed.assetId ?? "" };
}

// ---------------------------------------------------------------------------
// 分类 / 标签数据源
// ---------------------------------------------------------------------------

export interface CategorySummary {
  categoryId: string;
  name: string;
}

export interface TagSummary {
  tagId: string;
  name: string;
}

export function listCategories(): Promise<CategorySummary[]> {
  return apiFetch<CategorySummary[]>("/internal/catalog/categories");
}

export function listTags(): Promise<TagSummary[]> {
  return apiFetch<TagSummary[]>("/internal/catalog/tags");
}
