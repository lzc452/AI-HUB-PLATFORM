import type { DemandEntry } from "@ai-hub/contracts";

import { apiFetch } from "../../shared/api/client";

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
  authorEmployeeId: string;
  body: string;
  displayAnonymously: boolean;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listDemands(query: string): Promise<DemandListResult> {
  const search = new URLSearchParams();
  if (query) {
    search.set("query", query);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiFetch<DemandListResult>(`/internal/demands${suffix}`);
}

export function getDemand(demandId: string): Promise<DemandEntry> {
  return apiFetch<DemandEntry>(
    `/internal/demands/${encodeURIComponent(demandId)}`,
  );
}

export function listDemandComments(
  demandId: string,
): Promise<DemandCommentRecord[]> {
  return apiFetch<DemandCommentRecord[]>(
    `/internal/demands/${encodeURIComponent(demandId)}/comments`,
  );
}

export function likeDemand(demandId: string): Promise<unknown> {
  return apiFetch<unknown>(
    `/internal/demands/${encodeURIComponent(demandId)}/like`,
    { body: JSON.stringify({}), method: "POST" },
  );
}

export function addDemandComment(
  demandId: string,
  body: string,
): Promise<DemandCommentRecord> {
  return apiFetch<DemandCommentRecord>(
    `/internal/demands/${encodeURIComponent(demandId)}/comments`,
    {
      body: JSON.stringify({ body, parentCommentId: null }),
      method: "POST",
    },
  );
}
