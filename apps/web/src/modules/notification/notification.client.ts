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

export function listNotifications(): Promise<NotificationRecord[]> {
  return apiFetch<NotificationRecord[]>("/internal/notifications");
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
