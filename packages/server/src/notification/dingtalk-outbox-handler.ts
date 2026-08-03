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
      errorCode?: string,
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
    try {
      const result = await dingtalk.send({
        idempotencyKey: event.idempotencyKey,
        recipientEmployeeId: notification.recipientEmployeeId,
        message: notification.message,
      });
      if (!result.delivered) {
        const errorCode = result.errorCode ?? "DINGTALK_DELIVERY_RETRY";
        await repository.markDeliveryAttempt(
          event.idempotencyKey,
          "retry",
          errorCode,
        );
        throw new Error(errorCode);
      }
      await repository.markDeliveryAttempt(event.idempotencyKey, "sent");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("DINGTALK_")) {
        throw error;
      }
      const errorCode = "DINGTALK_PROVIDER_FAILED";
      await repository.markDeliveryAttempt(
        event.idempotencyKey,
        "retry",
        errorCode,
      );
      throw new Error(errorCode);
    }
  };
}
