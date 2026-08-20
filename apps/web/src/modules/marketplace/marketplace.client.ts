import type {
  ApplicationVersion,
  CatalogEntry,
  CatalogSort,
  RiskDescription,
} from "@ai-hub/contracts";

import { apiFetch, apiFetchBlob } from "../../shared/api/client";

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
  departmentId?: string | undefined;
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
  if (params.departmentId) {
    search.set("departmentId", params.departmentId);
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

export function listVersions(
  applicationId: string,
): Promise<ApplicationVersion[]> {
  return apiFetch<ApplicationVersion[]>(
    `/internal/catalog/${encodeURIComponent(applicationId)}/versions`,
  );
}

export interface CategorySummary {
  categoryId: string;
  name: string;
  isHot: boolean;
}

export function listCategories(): Promise<CategorySummary[]> {
  return apiFetch<CategorySummary[]>("/internal/catalog/categories");
}

export function getRiskDescription(
  applicationId: string,
): Promise<RiskDescription> {
  return apiFetch<RiskDescription>(
    `/internal/catalog/${encodeURIComponent(applicationId)}/risk`,
  );
}

export function saveRiskDescription(
  applicationId: string,
  riskDescription: string,
): Promise<RiskDescription> {
  return apiFetch<RiskDescription>(
    `/internal/catalog/${encodeURIComponent(applicationId)}/risk`,
    {
      body: JSON.stringify({ riskDescription }),
      method: "PUT",
    },
  );
}

// ---------------------------------------------------------------------------
// 交付解析与下载
// ---------------------------------------------------------------------------

export type DeliveryChannel = "web" | "desktop" | "mobile" | "mini_program";

/** qr：有二维码资产时携带 assetUrl（渲染 <img>）；无资产时后端回退 payload（entryUrl 文本）。 */
export type DeliveryResolveResult =
  | { kind: "web_redirect"; url: string }
  | { kind: "download"; url: string; fileName: string | null }
  | { kind: "qr"; assetUrl?: string; payload?: string }
  | { kind: "unavailable"; reason: string };

export function resolveDelivery(
  applicationId: string,
  channel: DeliveryChannel,
): Promise<DeliveryResolveResult> {
  return apiFetch<DeliveryResolveResult>(
    `/internal/catalog/${encodeURIComponent(applicationId)}/deliveries/${channel}/resolve`,
    { method: "POST" },
  );
}

/** 下载安装包（带身份头，返回 Blob）。 */
export async function downloadDeliveryAsset(
  applicationId: string,
  channel: DeliveryChannel,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await apiFetchBlob(
    `/internal/catalog/${encodeURIComponent(applicationId)}/deliveries/${channel}/asset`,
  );
  return {
    blob: response.blob,
    fileName: response.fileName ?? `${applicationId}-${channel}.bin`,
  };
}
