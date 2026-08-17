import { useQuery } from "@tanstack/react-query";

import {
  getDashboard,
  type AnalyticsDateRange,
  type DashboardKey,
} from "./analytics.client";
import { useAuth } from "../auth";

export function useDashboard(
  dashboardKey: DashboardKey,
  range?: AnalyticsDateRange,
) {
  const { session } = useAuth();
  return useQuery({
    queryFn: () => getDashboard(dashboardKey, range),
    queryKey: [
      "analytics",
      "dashboard",
      dashboardKey,
      session?.employeeId ?? null,
      session?.sessionId ?? null,
      range?.from ?? null,
      range?.to ?? null,
    ],
  });
}
