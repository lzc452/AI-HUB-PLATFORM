export interface NotificationInput {
  recipientEmployeeId: string;
  eventType: string;
  aggregateId: string;
  message: string;
}

export type NotificationDeliveryStatus =
  | "pending"
  | "sent"
  | "retry"
  | "failed";
