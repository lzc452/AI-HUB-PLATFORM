import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  showErrorMessage,
  showSuccessMessage,
} from "../../shared/ui/message";
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
    onError: (error) => showErrorMessage(error, "通知标记失败"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      showSuccessMessage("通知已标记为已读");
    },
  });
}
