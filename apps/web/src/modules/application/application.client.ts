import type { ApplicationStatus, DeliveryChannel } from "@ai-hub/contracts";

import { apiFetch } from "../../shared/api/client";

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
  versions: ApplicationVersionRecord[];
  deliveries: DeliveryRecord[];
  reviews: ReviewRecord[];
  reviewQueue: ReviewQueueRecord | null;
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

export interface CreatorSummary {
  versionDiff: {
    fromVersion: string;
    toVersion: string;
    changedFields: string[];
  };
  validationReport: {
    status: "passed" | "failed";
    checks: { name: string; status: "passed" | "failed" }[];
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
): Promise<ApplicationRecord> {
  return apiFetch<ApplicationRecord>(
    `/internal/applications/versions/${encodeURIComponent(applicationVersionId)}/submit-review`,
    { method: "POST" },
  );
}
