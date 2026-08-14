import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely, type Selectable } from "kysely";
import type {
  NotificationRecord,
  NotificationRepository,
} from "./notification.types.js";

export class KyselyNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: NotificationRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyNotificationRepository(transaction)),
      );
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const row = await this.db
      .selectFrom("notifications")
      .selectAll()
      .where("idempotency_key", "=", idempotencyKey)
      .executeTakeFirst();
    return row === undefined ? null : this.map(row);
  }

  async listForRecipient(employeeId: string) {
    const rows = await this.db
      .selectFrom("notifications")
      .selectAll()
      .where("recipient_employee_id", "=", employeeId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.map(row));
  }

  async findById(notificationId: string, employeeId: string) {
    const row = await this.db
      .selectFrom("notifications")
      .selectAll()
      .where("notification_id", "=", notificationId)
      .where("recipient_employee_id", "=", employeeId)
      .executeTakeFirst();
    return row === undefined ? null : this.map(row);
  }

  async create(
    input: Omit<NotificationRecord, "notificationId" | "createdAt">,
  ) {
    const row = await this.db
      .insertInto("notifications")
      .values({
        recipient_employee_id: input.recipientEmployeeId,
        event_type: input.eventType,
        aggregate_id: input.aggregateId,
        idempotency_key: input.idempotencyKey,
        message: input.message,
        read_at: input.readAt,
        delivery_status: "pending",
        delivery_attempts: 0,
        last_delivery_error: null,
        next_attempt_at: null,
      })
      .onConflict((oc) => oc.column("idempotency_key").doNothing())
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing === null) throw new Error("NOTIFICATION_CREATE_CONFLICT");
      return existing;
    }
    return this.map(row);
  }

  async markRead(notificationId: string, employeeId: string) {
    const row = await this.db
      .updateTable("notifications")
      .set({ read_at: new Date() })
      .where("notification_id", "=", notificationId)
      .where("recipient_employee_id", "=", employeeId)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("NOTIFICATION_NOT_FOUND");
    return this.map(row);
  }

  async markDeliveryAttempt(
    idempotencyKey: string,
    status: "sent" | "retry" | "failed",
    errorCode?: string,
  ): Promise<void> {
    await this.db
      .updateTable("notifications")
      .set({
        delivery_status: status,
        delivery_attempts: sql<number>`delivery_attempts + 1`,
        next_attempt_at:
          status === "sent" ? null : sql<Date>`now() + interval '5 minutes'`,
        last_delivery_error: errorCode ?? null,
      })
      .where("idempotency_key", "=", idempotencyKey)
      .execute();
  }

  async emitOutbox(input: {
    notificationId: string;
    eventType: string;
    idempotencyKey: string;
    metadata?: Readonly<Record<string, string>>;
  }): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        event_type: input.eventType,
        aggregate_type: "notification",
        aggregate_id: input.notificationId,
        payload: { notificationId: input.notificationId, ...input.metadata },
        idempotency_key: input.idempotencyKey,
        status: "pending",
        attempts: 0,
        available_at: new Date(),
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        completed_at: null,
      })
      .onConflict((oc) => oc.column("idempotency_key").doNothing())
      .execute();
  }

  private map(
    row: Selectable<DatabaseSchema["notifications"]>,
  ): NotificationRecord {
    return {
      notificationId: row.notification_id,
      recipientEmployeeId: row.recipient_employee_id,
      eventType: row.event_type,
      aggregateId: row.aggregate_id,
      idempotencyKey: row.idempotency_key,
      message: row.message,
      readAt: row.read_at,
      createdAt: row.created_at,
    };
  }
}
