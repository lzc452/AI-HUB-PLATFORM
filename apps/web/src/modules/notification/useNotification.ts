import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";
import {
  getNotificationSummary,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.client";

/** 轮询间隔：30s（规格 §3）。 */
const POLL_INTERVAL_MS = 30_000;

const NOTIFICATIONS_KEY = ["notifications"] as const;
const NOTIFICATION_SUMMARY_KEY = ["notifications", "summary"] as const;

async function refreshNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY] }),
    queryClient.invalidateQueries({ queryKey: [...NOTIFICATION_SUMMARY_KEY] }),
  ]);
}

export function useNotifications(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: listNotifications,
    queryKey: [...NOTIFICATIONS_KEY],
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** 未读计数（summary 端点），Header 徽标数据源，30s 轮询。 */
export function useUnreadNotificationCount(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: getNotificationSummary,
    queryKey: [...NOTIFICATION_SUMMARY_KEY],
    refetchInterval: POLL_INTERVAL_MS,
    select: (summary) => summary.unreadCount,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),
    onError: (error) => showErrorMessage(error, "通知标记失败"),
    onSuccess: async () => {
      await refreshNotificationQueries(queryClient);
      showSuccessMessage("通知已标记为已读");
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onError: (error) => showErrorMessage(error, "全部标记已读失败"),
    onSuccess: async () => {
      await refreshNotificationQueries(queryClient);
      showSuccessMessage("全部通知已标记为已读");
    },
  });
}
