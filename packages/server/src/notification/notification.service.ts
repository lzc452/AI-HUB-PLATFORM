import type { ActorContext, NotificationPayload } from "@ai-hub/contracts";
import type { DingTalkNotificationPort } from "./dingtalk.port.js";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";
import type {
  NotificationAuthorizationPort,
  NotificationRepository,
} from "./notification.types.js";

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly authorization: NotificationAuthorizationPort,
    private readonly dingtalk: DingTalkNotificationPort,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
  ) {}

  async createForEvent(
    actor: ActorContext,
    input: {
      recipientEmployeeId: string;
      eventType: string;
      aggregateId: string;
      message: string;
      metadata?: Readonly<Record<string, string>>;
      payload?: NotificationPayload;
    },
  ) {
    await this.assertAllowed(actor, "create");
    const idempotencyKey = `${input.eventType}:${input.aggregateId}:${input.recipientEmployeeId}`;
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (existing !== null) return existing;
    const notification = await this.repository.withTransaction(
      async (repository) => {
        const current = await repository.findByIdempotencyKey(idempotencyKey);
        if (current !== null) return current;
        const notification = await repository.create({
          recipientEmployeeId: input.recipientEmployeeId,
          eventType: input.eventType,
          aggregateId: input.aggregateId,
          idempotencyKey,
          message: input.message,
          payload: input.payload ?? {
            title: input.message,
            body: input.message,
          },
          readAt: null,
        });
        await repository.emitOutbox?.({
          notificationId: notification.notificationId,
          eventType: "notification.created",
          idempotencyKey,
          ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        });
        return notification;
      },
    );
    await this.analyticsEvents?.record(actor, {
      eventName: "notification_queued",
      aggregateType: "notification",
      aggregateId: notification.notificationId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `notification-queued:${idempotencyKey}`,
      metadata: { source: "notification.create" },
    });
    return notification;
  }

  async markRead(actor: ActorContext, notificationId: string) {
    await this.assertAllowed(actor, "read");
    return this.repository.markRead(notificationId, actor.employeeId);
  }

  async list(actor: ActorContext) {
    await this.assertAllowed(actor, "read");
    return this.repository.listForRecipient(actor.employeeId);
  }

  async getDetail(actor: ActorContext, notificationId: string) {
    await this.assertAllowed(actor, "read");
    const notification = await this.repository.findById?.(
      notificationId,
      actor.employeeId,
    );
    if (notification === null || notification === undefined) {
      throw new Error("NOTIFICATION_NOT_FOUND");
    }
    return notification;
  }

  async retryDelivery(
    actor: ActorContext,
    idempotencyKey: string,
  ): Promise<void> {
    await this.assertAllowed(actor, "deliver");
    const notification =
      await this.repository.findByIdempotencyKey(idempotencyKey);
    if (notification === null) throw new Error("NOTIFICATION_NOT_FOUND");
    try {
      const result = await this.dingtalk.send({
        idempotencyKey,
        recipientEmployeeId: notification.recipientEmployeeId,
        message: notification.message,
      });
      if (result.delivered) {
        await this.repository.markDeliveryAttempt(idempotencyKey, "sent");
      } else {
        if (result.errorCode === undefined) {
          await this.repository.markDeliveryAttempt(idempotencyKey, "retry");
        } else {
          await this.repository.markDeliveryAttempt(
            idempotencyKey,
            "retry",
            result.errorCode,
          );
        }
        await this.analyticsEvents?.record(actor, {
          eventName: "notification_delivery_retried",
          aggregateType: "notification",
          aggregateId: notification.notificationId,
          occurredAt: new Date().toISOString(),
          idempotencyKey: `notification-retried:${idempotencyKey}:${Date.now()}`,
          metadata: { source: "notification.retry" },
        });
      }
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : "DINGTALK_PROVIDER_FAILED";
      await this.repository.markDeliveryAttempt(
        idempotencyKey,
        "retry",
        errorCode,
      );
      throw error;
    }
  }

  private async assertAllowed(actor: ActorContext, action: string) {
    const decision = await this.authorization.authorize({
      actor,
      action,
      resourceType: "notification",
    });
    if (!decision.allowed) throw new Error("NOT_AUTHORIZED");
  }
}
