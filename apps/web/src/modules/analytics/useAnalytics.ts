import { useQuery } from "@tanstack/react-query";

import { getDashboard, type DashboardKey } from "./analytics.client";
import { useAuth } from "../auth";

export function useDashboard(dashboardKey: DashboardKey) {
  const { session } = useAuth();
  return useQuery({
    queryFn: () => getDashboard(dashboardKey),
    queryKey: [
      "analytics",
      "dashboard",
      dashboardKey,
      session?.employeeId ?? null,
      session?.sessionId ?? null,
    ],
  });
}
