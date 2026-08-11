import { useQuery } from "@tanstack/react-query";

import { getPlatformOverviewData } from "./platformOverview";
import { useAuth } from "../auth";

export function usePlatformOverview() {
  const { session } = useAuth();
  return useQuery({
    queryFn: getPlatformOverviewData,
    queryKey: [
      "analytics",
      "platform-overview",
      session?.employeeId ?? null,
      session?.sessionId ?? null,
    ],
  });
}
