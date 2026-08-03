import { describe, expect, it } from "vitest";
import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";
import { NotificationService } from "./notification.service.js";
import type {
  NotificationRecord,
  NotificationRepository,
} from "./notification.types.js";

const employee: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-E100",
};

class MemoryNotificationRepository implements NotificationRepository {
  notifications: NotificationRecord[] = [];
  attempts: string[] = [];
  outboxEvents: string[] = [];
  nextId = 1;

  async withTransaction<T>(
    operation: (repository: NotificationRepository) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
  async findByIdempotencyKey(idempotencyKey: string) {
    return (
      this.notifications.find(
        (item) => item.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }
  async listForRecipient(employeeId: string) {
    return this.notifications.filter(
      (item) => item.recipientEmployeeId === employeeId,
    );
  }
  async create(
    input: Omit<NotificationRecord, "notificationId" | "createdAt">,
  ) {
    const item = {
      ...input,
      notificationId: `notification-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.notifications.push(item);
    return item;
  }
  async markRead(notificationId: string, employeeId: string) {
    const item = this.notifications.find(
      (candidate) => candidate.notificationId === notificationId,
    );
    if (item === undefined || item.recipientEmployeeId !== employeeId)
      throw new Error("NOTIFICATION_NOT_FOUND");
    const updated = { ...item, readAt: new Date() };
    this.notifications[this.notifications.indexOf(item)] = updated;
    return updated;
  }
  async markDeliveryAttempt(
    idempotencyKey: string,
    status: "sent" | "retry" | "failed",
  ) {
    this.attempts.push(`${idempotencyKey}:${status}`);
  }
  async emitOutbox(input: { eventType: string }) {
    this.outboxEvents.push(input.eventType);
  }
}

const allowAll = async (): Promise<AuthorizationDecision> => ({
  allowed: true,
  reasonCode: "ALLOW_TEST",
});

describe("NotificationService", () => {
  it("creates one in-app notification for an idempotent event", async () => {
    const repository = new MemoryNotificationRepository();
    const service = new NotificationService(
      repository,
      { authorize: allowAll },
      {
        async send() {
          return { delivered: true };
        },
      },
    );

    const first = await service.createForEvent(employee, {
      recipientEmployeeId: "E100",
      eventType: "application.reviewed",
      aggregateId: "app-1",
      message: "应用审核完成",
    });
    const second = await service.createForEvent(employee, {
      recipientEmployeeId: "E100",
      eventType: "application.reviewed",
      aggregateId: "app-1",
      message: "应用审核完成",
    });
    expect(second.notificationId).toBe(first.notificationId);
    expect(repository.notifications).toHaveLength(1);
    expect(repository.outboxEvents).toEqual(["notification.created"]);
  });

  it("allows only the recipient to mark a notification read", async () => {
    const repository = new MemoryNotificationRepository();
    const service = new NotificationService(
      repository,
      { authorize: allowAll },
      {
        async send() {
          return { delivered: true };
        },
      },
    );
    const notification = await service.createForEvent(employee, {
      recipientEmployeeId: "E100",
      eventType: "application.withdrawn",
      aggregateId: "app-2",
      message: "应用已下架",
    });

    await expect(
      service.markRead(employee, notification.notificationId),
    ).resolves.toMatchObject({ readAt: expect.any(Date) });
    await expect(
      service.markRead(
        { ...employee, employeeId: "E200" },
        notification.notificationId,
      ),
    ).rejects.toThrow("NOTIFICATION_NOT_FOUND");
  });

  it("lists only the current employee's notifications", async () => {
    const repository = new MemoryNotificationRepository();
    const service = new NotificationService(
      repository,
      { authorize: allowAll },
      {
        async send() {
          return { delivered: true };
        },
      },
    );
    await service.createForEvent(employee, {
      recipientEmployeeId: "E100",
      eventType: "application.reviewed",
      aggregateId: "app-3",
      message: "审核完成",
    });
    await service.createForEvent(employee, {
      recipientEmployeeId: "E200",
      eventType: "application.reviewed",
      aggregateId: "app-4",
      message: "审核完成",
    });
    await expect(service.list(employee)).resolves.toHaveLength(1);
  });

  it("records a retry when DingTalk delivery fails without throwing", async () => {
    const repository = new MemoryNotificationRepository();
    const service = new NotificationService(
      repository,
      { authorize: allowAll },
      {
        async send() {
          return { delivered: false, errorCode: "DINGTALK_UNAVAILABLE" };
        },
      },
    );

    const notification = await service.createForEvent(employee, {
      recipientEmployeeId: "E100",
      eventType: "application.reviewed",
      aggregateId: "app-retry",
      message: "应用审核完成",
    });
    await service.retryDelivery(employee, notification.idempotencyKey);
    expect(repository.attempts).toContain(
      `${notification.idempotencyKey}:retry`,
    );
  });

  it("records a retry when the DingTalk provider throws", async () => {
    const repository = new MemoryNotificationRepository();
    const service = new NotificationService(
      repository,
      { authorize: allowAll },
      {
        async send() {
          throw new Error("DINGTALK_TIMEOUT");
        },
      },
    );
    const notification = await service.createForEvent(employee, {
      recipientEmployeeId: "E100",
      eventType: "analytics.export.failed",
      aggregateId: "export-thrown",
      message: "Export failed safely.",
    });

    await expect(
      service.retryDelivery(employee, notification.idempotencyKey),
    ).rejects.toThrow("DINGTALK_TIMEOUT");
    expect(repository.attempts).toContain(
      `${notification.idempotencyKey}:retry`,
    );
  });
});
