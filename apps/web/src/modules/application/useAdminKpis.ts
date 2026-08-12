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
 * 应用管理 KPI 摘要：使用真实应用管理列表聚合当前权限范围内的数据。
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
