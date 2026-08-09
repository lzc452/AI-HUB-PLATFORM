import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listNotifications, markNotificationRead } from "./notification.client";

export function useNotifications(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: listNotifications,
    queryKey: ["notifications"],
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
