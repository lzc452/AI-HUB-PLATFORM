import type {
  CreateDemandInput,
  DemandAudienceType,
  DemandEntry,
  DemandPriorityInput,
  DemandStatus,
} from "@ai-hub/contracts";

import { apiFetch, apiUploadRaw } from "../../shared/api/client";

export type DemandSort = "recent" | "priority" | "hot";

export interface DemandListQuery {
  query?: string;
  status?: DemandStatus;
  requesterDepartmentId?: string;
  audienceType?: DemandAudienceType;
  sort?: DemandSort;
  page?: number;
  pageSize?: number;
}

export interface DemandListResult {
  items: DemandEntry[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DemandCommentRecord {
  commentId: string;
  demandId: string;
  parentCommentId: string | null;
  authorEmployeeId: string | null;
  authorDisplayName?: string | null;
  authorDepartmentId?: string | null;
  authorDepartmentName?: string | null;
  body: string;
  displayAnonymously: boolean;
  likeCount: number;
  likedByCurrentActor: boolean;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemandPilotRecord {
  pilotId: string;
  demandId: string;
  applicationId: string | null;
  name: string;
  status: string;
  outcome: string | null;
  startsAt: string;
  endsAt: string | null;
  createdByEmployeeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemandCollaboratorRecord {
  demandId: string;
  employeeId: string;
  role: "owner" | "collaborator" | "operator";
  createdAt: string;
}

export interface DemandApplicationLinkRecord {
  demandId: string;
  applicationId: string;
  role: string;
  isPrimary: boolean;
  linkedByEmployeeId: string;
  createdAt: string;
}

export interface DemandReportRecord {
  reportId: string;
  demandId: string;
  commentId: string | null;
  reporterEmployeeId: string;
  reason: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function encodedDemandId(demandId: string): string {
  return encodeURIComponent(demandId);
}

export function listDemands(
  query: DemandListQuery = {},
): Promise<DemandListResult> {
  const search = new URLSearchParams();
  if (query.query) search.set("query", query.query);
  if (query.status) search.set("status", query.status);
  if (query.requesterDepartmentId) {
    search.set("requesterDepartmentId", query.requesterDepartmentId);
  }
  if (query.audienceType) search.set("audienceType", query.audienceType);
  if (query.sort) search.set("sort", query.sort);
  if (query.page) search.set("page", String(query.page));
  if (query.pageSize) search.set("pageSize", String(query.pageSize));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiFetch<DemandListResult>(`/internal/demands${suffix}`);
}

export function getDemand(demandId: string): Promise<DemandEntry> {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}`,
  );
}

export function createDemandDraft(input: CreateDemandInput) {
  return apiFetch<DemandEntry>("/internal/demands", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function updateDemandDraft(
  demandId: string,
  input: Partial<CreateDemandInput> & { expectedVersion?: number },
) {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}`,
    {
      body: JSON.stringify(input),
      method: "PATCH",
    },
  );
}

export function submitDemandForReview(demandId: string) {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/submit-review`,
    { body: JSON.stringify({}), method: "POST" },
  );
}

export function reviewDemand(
  demandId: string,
  input: { decision: "publish" | "reject"; reason?: string },
) {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/review`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function claimDemand(demandId: string, expectedVersion?: number) {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/claim`,
    {
      body: JSON.stringify(
        expectedVersion === undefined ? {} : { expectedVersion },
      ),
      method: "POST",
    },
  );
}

export function advanceDemandStatus(
  demandId: string,
  status: DemandStatus,
  expectedVersion: number,
  reason?: string,
) {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/status`,
    {
      body: JSON.stringify({
        expectedVersion,
        nextStatus: status,
        ...(reason ? { reason } : {}),
      }),
      method: "POST",
    },
  );
}

export function setDemandPriority(
  demandId: string,
  input: DemandPriorityInput & { expectedVersion?: number },
) {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/priority`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function listDemandComments(
  demandId: string,
): Promise<DemandCommentRecord[]> {
  return apiFetch<DemandCommentRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/comments`,
  );
}

export function likeDemand(
  demandId: string,
): Promise<{ liked: boolean; likeCount?: number }> {
  return apiFetch<{ liked: boolean; likeCount?: number }>(
    `/internal/demands/${encodedDemandId(demandId)}/like`,
    { body: JSON.stringify({}), method: "POST" },
  );
}

export function addDemandComment(
  demandId: string,
  body: string,
  parentCommentId: string | null = null,
): Promise<DemandCommentRecord> {
  return apiFetch<DemandCommentRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/comments`,
    {
      body: JSON.stringify({ body, parentCommentId }),
      method: "POST",
    },
  );
}

export function likeDemandComment(
  demandId: string,
  commentId: string,
): Promise<{ liked: boolean; likeCount?: number }> {
  return apiFetch<{ liked: boolean; likeCount?: number }>(
    `/internal/demands/${encodedDemandId(demandId)}/comments/${encodeURIComponent(commentId)}/like`,
    { body: JSON.stringify({}), method: "POST" },
  );
}

export function reportDemand(
  demandId: string,
  input: { reason: string; commentId: string | null },
) {
  return apiFetch<unknown>(
    `/internal/demands/${encodedDemandId(demandId)}/reports`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function listDemandPilots(demandId: string) {
  return apiFetch<DemandPilotRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/pilots`,
  );
}

export interface DemandProgressRecord {
  progressId: string;
  demandId: string;
  authorEmployeeId: string;
  status: DemandStatus;
  title: string;
  body: string;
  createdAt: string;
}

export function listDemandReports(demandId: string) {
  return apiFetch<DemandReportRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/reports`,
  );
}

export function listDemandProgress(demandId: string) {
  return apiFetch<DemandProgressRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/progress`,
  );
}

export function addDemandProgress(
  demandId: string,
  input: { status: DemandStatus; title: string; body: string },
) {
  return apiFetch<DemandProgressRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/progress`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function addDemandCollaborator(
  demandId: string,
  input: {
    employeeId: string;
    role: "collaborator" | "operator";
    expectedVersion: number;
  },
) {
  return apiFetch<DemandCollaboratorRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/collaborators`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function updateDemandCollaboratorRole(
  demandId: string,
  employeeId: string,
  input: { role: "collaborator" | "operator"; expectedVersion: number },
) {
  return apiFetch<DemandCollaboratorRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/collaborators/${encodeURIComponent(employeeId)}`,
    {
      body: JSON.stringify(input),
      method: "PATCH",
    },
  );
}

export function createDemandPilot(
  demandId: string,
  input: {
    name: string;
    startsAt: string;
    endsAt?: string;
    applicationId?: string;
  },
) {
  return apiFetch<DemandPilotRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/pilots`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function updateDemandPilot(
  demandId: string,
  pilotId: string,
  input: { status?: string; outcome?: string; endsAt?: string | null },
) {
  return apiFetch<DemandPilotRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/pilots/${encodeURIComponent(pilotId)}`,
    {
      body: JSON.stringify(input),
      method: "PATCH",
    },
  );
}

export function linkDemandApplication(
  demandId: string,
  input: {
    applicationId: string;
    role: "candidate" | "pilot" | "solution";
    isPrimary?: boolean;
    expectedVersion: number;
  },
) {
  return apiFetch<DemandApplicationLinkRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/applications`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function createApplicationFromDemand(
  demandId: string,
  input: {
    name: string;
    summary: string;
    departmentId?: string;
    maintainerEmployeeId?: string;
    isPrimary?: boolean;
  },
) {
  return apiFetch<DemandApplicationLinkRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/applications/from-demand`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function mergeDemand(
  demandId: string,
  input: {
    targetDemandId: string;
    sourceExpectedVersion: number;
    targetExpectedVersion: number;
  },
) {
  return apiFetch<unknown>(
    `/internal/demands/${encodedDemandId(demandId)}/merge`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function resolveDemandReport(
  demandId: string,
  reportId: string,
  status: "dismissed" | "hidden" | "restored",
) {
  return apiFetch<DemandReportRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/reports/${encodeURIComponent(reportId)}/resolve`,
    {
      body: JSON.stringify({ status }),
      method: "POST",
    },
  );
}

export function lookupAnonymousAuthor(demandId: string, commentId: string) {
  return apiFetch<{ employeeId: string }>(
    `/internal/demands/${encodedDemandId(demandId)}/comments/${encodeURIComponent(commentId)}/anonymous-author`,
  );
}

export function listDemandCollaborators(demandId: string) {
  return apiFetch<DemandCollaboratorRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/collaborators`,
  );
}

export function removeDemandCollaborator(
  demandId: string,
  employeeId: string,
  expectedVersion?: number,
) {
  const suffix =
    expectedVersion === undefined
      ? ""
      : `?expectedVersion=${encodeURIComponent(String(expectedVersion))}`;
  return apiFetch<void>(
    `/internal/demands/${encodedDemandId(demandId)}/collaborators/${encodeURIComponent(employeeId)}${suffix}`,
    { method: "DELETE" },
  );
}

export function listDemandApplications(demandId: string) {
  return apiFetch<DemandApplicationLinkRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/applications`,
  );
}

export function removeDemandApplication(
  demandId: string,
  applicationId: string,
  expectedVersion?: number,
) {
  const suffix =
    expectedVersion === undefined
      ? ""
      : `?expectedVersion=${encodeURIComponent(String(expectedVersion))}`;
  return apiFetch<void>(
    `/internal/demands/${encodedDemandId(demandId)}/applications/${encodeURIComponent(applicationId)}${suffix}`,
    { method: "DELETE" },
  );
}

export interface DemandClaimProposalRecord {
  proposalId: string;
  demandId: string;
  proposerEmployeeId: string;
  ownerEmployeeId: string;
  collaboratorEmployeeIds: string[];
  approach: string;
  estimatedValidationDuration: string;
  resourceNeeds: string;
  preference: string | null;
  status: "proposed" | "selected" | "rejected" | "withdrawn";
  createdAt: string;
  updatedAt: string;
}

export function submitDemandClaimProposal(
  demandId: string,
  input: {
    ownerEmployeeId: string;
    collaboratorEmployeeIds: string[];
    approach: string;
    estimatedValidationDuration: string;
    resourceNeeds: string;
    preference?: string;
  },
) {
  return apiFetch<DemandClaimProposalRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/claim-proposals`,
    { body: JSON.stringify(input), method: "POST" },
  );
}

export function listDemandClaimProposals(
  demandId: string,
): Promise<DemandClaimProposalRecord[]> {
  return apiFetch<DemandClaimProposalRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/claim-proposals`,
  );
}

export function withdrawDemandClaimProposal(
  demandId: string,
  proposalId: string,
) {
  return apiFetch<DemandClaimProposalRecord>(
    `/internal/demands/${encodedDemandId(demandId)}/claim-proposals/${encodeURIComponent(proposalId)}/withdraw`,
    { body: JSON.stringify({}), method: "POST" },
  );
}

export function confirmDemandClaim(
  demandId: string,
  proposalId: string,
  expectedVersion: number,
) {
  return apiFetch<import("@ai-hub/contracts").DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/claim-proposals/${encodeURIComponent(proposalId)}/confirm`,
    { body: JSON.stringify({ expectedVersion }), method: "POST" },
  );
}

export function releaseDemandClaim(
  demandId: string,
  expectedVersion: number,
  reason?: string,
) {
  return apiFetch<import("@ai-hub/contracts").DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/release-claim`,
    {
      body: JSON.stringify({ expectedVersion, ...(reason ? { reason } : {}) }),
      method: "POST",
    },
  );
}

export function confirmDemandPriority(
  demandId: string,
  input: {
    expectedVersion: number;
    confirmedPriority: "high" | "medium" | "low";
    adjustmentReason?: string;
  },
) {
  return apiFetch<import("@ai-hub/contracts").DemandEntry>(
    `/internal/demands/${encodedDemandId(demandId)}/priority/confirm`,
    { body: JSON.stringify(input), method: "POST" },
  );
}

export interface DemandAttachmentRecord {
  attachmentId: string;
  demandId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByEmployeeId: string;
  createdAt: string;
}

export function uploadDemandAttachment(
  file: File,
): Promise<DemandAttachmentRecord> {
  return apiUploadRaw<DemandAttachmentRecord>(
    "/internal/demands/uploads",
    file,
    "POST",
    {
      "x-file-name": encodeURIComponent(file.name),
      "x-file-mime": file.type || "application/octet-stream",
    },
  );
}

export function listDemandAttachments(
  demandId: string,
): Promise<DemandAttachmentRecord[]> {
  return apiFetch<DemandAttachmentRecord[]>(
    `/internal/demands/${encodedDemandId(demandId)}/attachments`,
  );
}

export function deleteDemandAttachment(
  demandId: string,
  attachmentId: string,
) {
  return apiFetch<void>(
    `/internal/demands/${encodedDemandId(demandId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
}
