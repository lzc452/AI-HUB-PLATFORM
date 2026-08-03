import type { ClaimedOutboxEvent } from "@ai-hub/contracts";
import type { DingTalkNotificationPort } from "./dingtalk.port.js";
import type { NotificationRecord } from "./notification.types.js";

type NotificationDeliveryRepository = Pick<
  {
    findByIdempotencyKey(
      idempotencyKey: string,
    ): Promise<NotificationRecord | null>;
    markDeliveryAttempt(
      idempotencyKey: string,
      status: "sent" | "retry" | "failed",
    ): Promise<void>;
  },
  "findByIdempotencyKey" | "markDeliveryAttempt"
>;

type NotificationDeliveryRecord = Pick<
  NotificationRecord,
  "recipientEmployeeId" | "message"
>;

export function createDingTalkNotificationOutboxHandler(
  repository: NotificationDeliveryRepository,
  dingtalk: DingTalkNotificationPort,
) {
  return async (
    event: ClaimedOutboxEvent<{ notificationId?: string }>,
  ): Promise<void> => {
    const notificationId = event.payload.notificationId;
    if (notificationId === undefined) {
      throw new Error("NOTIFICATION_PAYLOAD_INVALID");
    }
    const notification = (await repository.findByIdempotencyKey(
      event.idempotencyKey,
    )) as NotificationDeliveryRecord | null;
    if (notification === null) {
      throw new Error("NOTIFICATION_NOT_FOUND");
    }
    const result = await dingtalk.send({
      idempotencyKey: event.idempotencyKey,
      recipientEmployeeId: notification.recipientEmployeeId,
      message: notification.message,
    });
    await repository.markDeliveryAttempt(
      event.idempotencyKey,
      result.delivered ? "sent" : "retry",
    );
    if (!result.delivered) {
      throw new Error(result.errorCode ?? "DINGTALK_DELIVERY_RETRY");
    }
  };
}
