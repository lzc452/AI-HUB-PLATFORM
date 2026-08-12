import type {
  PaginatedResult,
  RatingOutput,
  CommentOutput,
} from "@ai-hub/contracts";

import { apiFetch } from "../../shared/api/client";

function interactionsPath(applicationId: string): string {
  return `/internal/applications/${encodeURIComponent(applicationId)}/interactions`;
}

export function toggleLike(applicationId: string): Promise<unknown> {
  return apiFetch<unknown>(`${interactionsPath(applicationId)}/like`, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function rateApplication(
  applicationId: string,
  stars: number,
): Promise<unknown> {
  return apiFetch<unknown>(`${interactionsPath(applicationId)}/rating`, {
    body: JSON.stringify({ stars }),
    method: "POST",
  });
}

export function listRatings(
  applicationId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<RatingOutput>> {
  return apiFetch<PaginatedResult<RatingOutput>>(
    `${interactionsPath(applicationId)}/ratings?page=${page}&pageSize=${pageSize}`,
  );
}

export function listComments(
  applicationId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<CommentOutput>> {
  return apiFetch<PaginatedResult<CommentOutput>>(
    `${interactionsPath(applicationId)}/comments?page=${page}&pageSize=${pageSize}`,
  );
}

export function hideComment(
  applicationId: string,
  commentId: string,
): Promise<CommentOutput> {
  return apiFetch<CommentOutput>(
    `${interactionsPath(applicationId)}/comments/${encodeURIComponent(commentId)}/hide`,
    {
      body: JSON.stringify({}),
      method: "POST",
    },
  );
}

export function restoreComment(
  applicationId: string,
  commentId: string,
): Promise<CommentOutput> {
  return apiFetch<CommentOutput>(
    `${interactionsPath(applicationId)}/comments/${encodeURIComponent(commentId)}/restore`,
    {
      body: JSON.stringify({}),
      method: "POST",
    },
  );
}

// ---------------------------------------------------------------------------
// 评论（普通员工根评论 / 官方回复）与应用反馈
// ---------------------------------------------------------------------------

export interface CommentOutputExt extends CommentOutput {
  commentKind?: "user" | "official";
}

/** 发表评论：parentCommentId 为空创建根评论；提供时为官方回复（需 owner/maintainer）。 */
export function createComment(
  applicationId: string,
  input: { parentCommentId?: string | null; body: string },
): Promise<CommentOutputExt> {
  return apiFetch<CommentOutputExt>(
    `${interactionsPath(applicationId)}/comments`,
    {
      body: JSON.stringify({
        parentCommentId: input.parentCommentId ?? null,
        body: input.body,
      }),
      method: "POST",
    },
  );
}

export interface FeedbackRecord {
  feedbackId: string;
  applicationId: string;
  applicationVersionId: string | null;
  creatorEmployeeId: string;
  type: "bug" | "suggestion" | "content_issue";
  body: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  assigneeEmployeeId: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function createFeedback(
  applicationId: string,
  input: { type: FeedbackRecord["type"]; body: string },
): Promise<FeedbackRecord> {
  return apiFetch<FeedbackRecord>(
    `${interactionsPath(applicationId)}/feedback`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function listMyFeedback(
  applicationId: string,
): Promise<FeedbackRecord[]> {
  return apiFetch<FeedbackRecord[]>(
    `${interactionsPath(applicationId)}/feedback`,
  );
}
