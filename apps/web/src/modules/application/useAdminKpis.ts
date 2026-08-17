import type { ApplicationAdminKpis } from "@ai-hub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getAdminApplicationKpis } from "./application.client";

export type AdminKpiSummary = ApplicationAdminKpis;

const QUERY_KEY = ["applications", "admin-kpis"] as const;

/**
 * 应用管理 KPI 摘要：使用真实应用管理列表聚合当前权限范围内的数据。
 */
export function useAdminKpis() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: getAdminApplicationKpis,
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
