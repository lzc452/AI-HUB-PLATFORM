import { describe, expect, it, vi } from "vitest";
import { createDingTalkNotificationOutboxHandler } from "./dingtalk-outbox-handler.js";

const event = {
  id: "outbox-1",
  eventType: "notification.created",
  aggregateType: "notification",
  aggregateId: "notification-1",
  payload: { notificationId: "notification-1" },
  idempotencyKey: "analytics.export.completed:export-1:employee-2",
  attempts: 1,
};

describe("DingTalk notification Outbox handler", () => {
  it("calls DingTalk only after an Outbox event is claimed and records sent", async () => {
    const repository = {
      findByIdempotencyKey: vi.fn().mockResolvedValue({
        notificationId: "notification-1",
        recipientEmployeeId: "employee-2",
        message: "Analytics export is ready.",
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue(undefined),
    };
    const dingtalk = {
      send: vi.fn().mockResolvedValue({ delivered: true }),
    };

    await createDingTalkNotificationOutboxHandler(repository, dingtalk)(event);

    expect(dingtalk.send).toHaveBeenCalledWith({
      idempotencyKey: event.idempotencyKey,
      recipientEmployeeId: "employee-2",
      message: "Analytics export is ready.",
    });
    expect(repository.markDeliveryAttempt).toHaveBeenCalledWith(
      event.idempotencyKey,
      "sent",
    );
  });

  it("records retry and throws a safe code when DingTalk is unavailable", async () => {
    const repository = {
      findByIdempotencyKey: vi.fn().mockResolvedValue({
        notificationId: "notification-1",
        recipientEmployeeId: "employee-2",
        message: "Analytics export is ready.",
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue(undefined),
    };
    const dingtalk = {
      send: vi.fn().mockResolvedValue({
        delivered: false,
        errorCode: "DINGTALK_UNAVAILABLE",
      }),
    };

    await expect(
      createDingTalkNotificationOutboxHandler(repository, dingtalk)(event),
    ).rejects.toThrow("DINGTALK_UNAVAILABLE");
    expect(repository.markDeliveryAttempt).toHaveBeenCalledWith(
      event.idempotencyKey,
      "retry",
      "DINGTALK_UNAVAILABLE",
    );
  });

  it("records retry when the provider throws instead of leaving pending state", async () => {
    const repository = {
      findByIdempotencyKey: vi.fn().mockResolvedValue({
        notificationId: "notification-1",
        recipientEmployeeId: "employee-2",
        message: "Analytics export is ready.",
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue(undefined),
    };
    const dingtalk = {
      send: vi.fn().mockRejectedValue(new Error("network reset")),
    };

    await expect(
      createDingTalkNotificationOutboxHandler(repository, dingtalk)(event),
    ).rejects.toThrow("DINGTALK_PROVIDER_FAILED");
    expect(repository.markDeliveryAttempt).toHaveBeenCalledWith(
      event.idempotencyKey,
      "retry",
      "DINGTALK_PROVIDER_FAILED",
    );
  });
});
