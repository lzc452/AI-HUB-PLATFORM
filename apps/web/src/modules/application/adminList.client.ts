import type { DeliveryChannel } from "@ai-hub/contracts";

import { apiFetch } from "../../shared/api/client";
import type { AdminApplicationRow } from "./adminListMeta";

export interface AdminApplicationListResult {
  items: AdminApplicationRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminApplicationListParams {
  keyword?: string;
  mode?: "all" | "review" | "owned";
  status?: string;
  departmentId?: string;
  applicationType?: string;
  channel?: DeliveryChannel;
  sort?: "recent" | "name" | "status";
  page?: number;
  pageSize?: number;
}

/** 应用管理列表通过后端查询，页面保持原有 wire shape。 */
export function getAdminApplicationList(
  params: AdminApplicationListParams = {},
): Promise<AdminApplicationListResult> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "all") search.set(key, String(value));
  }
  return apiFetch<AdminApplicationListResult>(
    `/internal/applications/admin-list?${search.toString()}`,
  );
}
