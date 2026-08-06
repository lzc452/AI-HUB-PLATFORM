import type { CatalogEntry, CatalogSort } from "@ai-hub/contracts";

import { apiFetch } from "../../shared/api/client";

export interface CatalogListResult {
  items: CatalogEntry[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CatalogSearchParams {
  query: string;
  sort: CatalogSort;
  categoryId?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export function searchCatalog(
  params: CatalogSearchParams,
): Promise<CatalogListResult> {
  const search = new URLSearchParams();
  if (params.query) {
    search.set("query", params.query);
  }
  if (params.categoryId) {
    search.set("categoryId", params.categoryId);
  }
  search.set("sort", params.sort);
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  search.set("pageSize", `${params.pageSize ?? 20}`);
  return apiFetch<CatalogListResult>(`/internal/catalog?${search.toString()}`);
}

export function getCatalogEntry(applicationId: string): Promise<CatalogEntry> {
  return apiFetch<CatalogEntry>(
    `/internal/catalog/${encodeURIComponent(applicationId)}`,
  );
}
