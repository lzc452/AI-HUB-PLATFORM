import { useQuery } from "@tanstack/react-query";

import { getPlatformOverviewData } from "./platformOverview";
import type { AnalyticsDateRange } from "./analytics.client";
import { useAuth } from "../auth";

export function usePlatformOverview(range?: AnalyticsDateRange) {
  const { session } = useAuth();
  return useQuery({
    queryFn: () => getPlatformOverviewData(range),
    queryKey: [
      "analytics",
      "platform-overview",
      session?.employeeId ?? null,
      session?.sessionId ?? null,
      range?.from ?? null,
      range?.to ?? null,
    ],
  });
}
