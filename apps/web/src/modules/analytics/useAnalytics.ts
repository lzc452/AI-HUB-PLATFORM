import { useQuery } from "@tanstack/react-query";

import { getDashboard, type DashboardKey } from "./analytics.client";

export function useDashboard(dashboardKey: DashboardKey) {
  return useQuery({
    queryFn: () => getDashboard(dashboardKey),
    queryKey: ["analytics", "dashboard", dashboardKey],
  });
}
