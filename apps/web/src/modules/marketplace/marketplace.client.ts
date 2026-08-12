import type {
  ApplicationVersion,
  CatalogEntry,
  CatalogSort,
  RiskDescription,
} from "@ai-hub/contracts";

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

export function listVersions(
  applicationId: string,
): Promise<ApplicationVersion[]> {
  return apiFetch<ApplicationVersion[]>(
    `/internal/catalog/${encodeURIComponent(applicationId)}/versions`,
  );
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

export type DeliveryResolveResult =
  | { kind: "web_redirect"; url: string }
  | { kind: "download"; url: string; fileName: string | null }
  | { kind: "qr"; payload: string }
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
  const employeeId = localStorage.getItem("ai-hub.employee-id") ?? "";
  const sessionId = localStorage.getItem("ai-hub.session-id") ?? "";
  const response = await fetch(
    `/internal/catalog/${encodeURIComponent(applicationId)}/deliveries/${channel}/asset`,
    {
      headers: {
        "x-employee-id": employeeId,
        "x-session-id": sessionId,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`DOWNLOAD_FAILED:${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const fileName = match?.[1] ?? `${applicationId}-${channel}.bin`;
  return { blob, fileName };
}
