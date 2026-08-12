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
