import { apiFetch } from "../../shared/api/client";
import type { NotificationPayload } from "@ai-hub/contracts";

export interface NotificationRecord {
  notificationId: string;
  recipientEmployeeId: string;
  eventType: string;
  aggregateId: string;
  idempotencyKey: string;
  message: string;
  payload?: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSummary {
  unreadCount: number;
}

export function listNotifications(): Promise<NotificationRecord[]> {
  return apiFetch<NotificationRecord[]>("/internal/notifications");
}

/** 未读汇总（规格 §2.1：GET /internal/notifications/summary）。 */
export function getNotificationSummary(): Promise<NotificationSummary> {
  return apiFetch<NotificationSummary>("/internal/notifications/summary");
}

/** 服务端批量已读（规格 §2.1：POST /internal/notifications/read-all）。 */
export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>("/internal/notifications/read-all", {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function getNotification(
  notificationId: string,
): Promise<NotificationRecord> {
  return apiFetch<NotificationRecord>(
    `/internal/notifications/${encodeURIComponent(notificationId)}`,
  );
}

export function markNotificationRead(
  notificationId: string,
): Promise<NotificationRecord> {
  return apiFetch<NotificationRecord>(
    `/internal/notifications/${encodeURIComponent(notificationId)}/read`,
    { body: JSON.stringify({}), method: "POST" },
  );
}

export function retryNotificationDelivery(
  idempotencyKey: string,
): Promise<void> {
  return apiFetch<void>("/internal/notifications/retry", {
    body: JSON.stringify({ idempotencyKey }),
    method: "POST",
  });
}
