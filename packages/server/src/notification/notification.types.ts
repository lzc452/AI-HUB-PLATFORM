import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";

export interface NotificationRecord {
  notificationId: string;
  recipientEmployeeId: string;
  eventType: string;
  aggregateId: string;
  idempotencyKey: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationAuthorizationPort {
  authorize(request: {
    actor: ActorContext;
    action: string;
    resourceType: string;
  }): Promise<AuthorizationDecision>;
}

export interface NotificationRepository {
  withTransaction<T>(
    operation: (repository: NotificationRepository) => Promise<T>,
  ): Promise<T>;
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationRecord | null>;
  listForRecipient(employeeId: string): Promise<readonly NotificationRecord[]>;
  create(
    input: Omit<NotificationRecord, "notificationId" | "createdAt">,
  ): Promise<NotificationRecord>;
  markRead(
    notificationId: string,
    employeeId: string,
  ): Promise<NotificationRecord>;
  markDeliveryAttempt(
    idempotencyKey: string,
    status: "sent" | "retry" | "failed",
  ): Promise<void>;
  emitOutbox?(input: {
    notificationId: string;
    eventType: string;
    idempotencyKey: string;
  }): Promise<void>;
}
