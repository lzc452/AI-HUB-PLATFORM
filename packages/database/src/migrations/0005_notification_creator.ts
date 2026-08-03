import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("notifications")
    .addColumn("notification_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("recipient_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("event_type", "varchar(120)", (column) => column.notNull())
    .addColumn("aggregate_id", "varchar(128)", (column) => column.notNull())
    .addColumn("idempotency_key", "varchar(255)", (column) =>
      column.notNull().unique(),
    )
    .addColumn("message", "text", (column) => column.notNull())
    .addColumn("read_at", "timestamptz")
    .addColumn("delivery_status", "varchar(16)", (column) =>
      column.notNull().defaultTo("pending"),
    )
    .addColumn("delivery_attempts", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("last_delivery_error", "varchar(120)")
    .addColumn("next_attempt_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    alter table notifications
    add constraint notifications_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'retry', 'failed'))
  `.execute(db);
  await db.schema
    .createIndex("notifications_recipient_unread_idx")
    .on("notifications")
    .columns(["recipient_employee_id", "read_at", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("notifications_recipient_unread_idx").execute();
  await db.schema.dropTable("notifications").execute();
}
