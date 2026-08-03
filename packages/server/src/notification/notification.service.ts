import type { ActorContext } from "@ai-hub/contracts";
import type { DingTalkNotificationPort } from "./dingtalk.port.js";
import type {
  NotificationAuthorizationPort,
  NotificationRepository,
} from "./notification.types.js";

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly authorization: NotificationAuthorizationPort,
    private readonly dingtalk: DingTalkNotificationPort,
  ) {}

  async createForEvent(
    actor: ActorContext,
    input: {
      recipientEmployeeId: string;
      eventType: string;
      aggregateId: string;
      message: string;
      metadata?: Readonly<Record<string, string>>;
    },
  ) {
    await this.assertAllowed(actor, "create");
    const idempotencyKey = `${input.eventType}:${input.aggregateId}:${input.recipientEmployeeId}`;
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (existing !== null) return existing;
    return this.repository.withTransaction(async (repository) => {
      const current = await repository.findByIdempotencyKey(idempotencyKey);
      if (current !== null) return current;
      const notification = await repository.create({
        recipientEmployeeId: input.recipientEmployeeId,
        eventType: input.eventType,
        aggregateId: input.aggregateId,
        idempotencyKey,
        message: input.message,
        readAt: null,
      });
      await repository.emitOutbox?.({
        notificationId: notification.notificationId,
        eventType: "notification.created",
        idempotencyKey,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      });
      return notification;
    });
  }

  async markRead(actor: ActorContext, notificationId: string) {
    await this.assertAllowed(actor, "read");
    return this.repository.markRead(notificationId, actor.employeeId);
  }

  async list(actor: ActorContext) {
    await this.assertAllowed(actor, "read");
    return this.repository.listForRecipient(actor.employeeId);
  }

  async retryDelivery(
    actor: ActorContext,
    idempotencyKey: string,
  ): Promise<void> {
    await this.assertAllowed(actor, "deliver");
    const notification =
      await this.repository.findByIdempotencyKey(idempotencyKey);
    if (notification === null) throw new Error("NOTIFICATION_NOT_FOUND");
    const result = await this.dingtalk.send({
      idempotencyKey,
      recipientEmployeeId: notification.recipientEmployeeId,
      message: notification.message,
    });
    await this.repository.markDeliveryAttempt(
      idempotencyKey,
      result.delivered ? "sent" : "retry",
    );
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
