export interface DingTalkNotificationPort {
  send(input: {
    idempotencyKey: string;
    recipientEmployeeId: string;
    message: string;
  }): Promise<{ delivered: boolean; errorCode?: string }>;
}
