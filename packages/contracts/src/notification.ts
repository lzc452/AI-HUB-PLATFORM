export interface NotificationInput {
  recipientEmployeeId: string;
  eventType: string;
  aggregateId: string;
  message: string;
  payload?: NotificationPayload;
}

export interface NotificationPayload {
  title?: string;
  body?: string;
  detail?: Readonly<Record<string, unknown>>;
  deepLink?: string;
}

export type NotificationDeliveryStatus =
  | "pending"
  | "sent"
  | "retry"
  | "failed";
