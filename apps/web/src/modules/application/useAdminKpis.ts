import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getAdminApplicationList } from "./adminList.client";

export interface AdminKpiSummary {
  deliveryFailed: number;
  pendingReview: number;
  published: number;
  total: number;
}

const QUERY_KEY = ["applications", "admin-kpis"] as const;

/**
 * 应用管理 KPI 摘要：与列表解耦的独立查询。
 * 当前阶段以 pageSize=200 拉取全量并在前端聚合（mock 数据 42 条）；
 * 后续对接 `GET /internal/applications/admin-summary` 时只需替换 queryFn。
 */
export function useAdminKpis() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: async (): Promise<AdminKpiSummary> => {
      const result = await getAdminApplicationList({ pageSize: 200 });
      const items = result.items;
      return {
        deliveryFailed: items.filter(
          (row) =>
            row.deliveryChannels.length === 0 || row.status === "withdrawn",
        ).length,
        pendingReview: items.filter((row) => row.status === "in_review").length,
        published: items.filter((row) => row.status === "published").length,
        total: result.total,
      };
    },
    queryKey: QUERY_KEY,
    staleTime: 30_000,
  });

  return {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isPending: query.isPending,
    refetch: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  };
}
