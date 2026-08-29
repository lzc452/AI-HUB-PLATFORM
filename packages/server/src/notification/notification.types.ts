import type {
  ActorContext,
  AuthorizationDecision,
  NotificationPayload,
} from "@ai-hub/contracts";

export interface NotificationRecord {
  notificationId: string;
  recipientEmployeeId: string;
  eventType: string;
  aggregateId: string;
  idempotencyKey: string;
  message: string;
  payload?: NotificationPayload;
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
  findById?(
    notificationId: string,
    employeeId: string,
  ): Promise<NotificationRecord | null>;
  listForRecipient(employeeId: string): Promise<readonly NotificationRecord[]>;
  create(
    input: Omit<NotificationRecord, "notificationId" | "createdAt">,
  ): Promise<NotificationRecord>;
  markRead(
    notificationId: string,
    employeeId: string,
  ): Promise<NotificationRecord>;
  /** 统计指定收件人的未读通知数。 */
  countUnread(employeeId: string): Promise<number>;
  /** 把指定收件人的全部未读通知置为已读，返回更新条数。 */
  markAllRead(employeeId: string): Promise<number>;
  markDeliveryAttempt(
    idempotencyKey: string,
    status: "sent" | "retry" | "failed",
    errorCode?: string,
  ): Promise<void>;
  emitOutbox?(input: {
    notificationId: string;
    eventType: string;
    idempotencyKey: string;
    metadata?: Readonly<Record<string, string>>;
    payload?: NotificationPayload;
  }): Promise<void>;
}
