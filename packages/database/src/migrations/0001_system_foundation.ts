import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pgcrypto`.execute(db);

  await db.schema
    .createTable("outbox_events")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_type", "varchar(255)", (column) => column.notNull())
    .addColumn("aggregate_type", "varchar(255)", (column) => column.notNull())
    .addColumn("aggregate_id", "varchar(255)", (column) => column.notNull())
    .addColumn("payload", "jsonb", (column) => column.notNull())
    .addColumn("idempotency_key", "varchar(255)", (column) => column.notNull())
    .addColumn("status", "varchar(32)", (column) =>
      column.notNull().defaultTo("pending"),
    )
    .addColumn("attempts", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("available_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("claimed_by", "varchar(255)")
    .addColumn("claimed_at", "timestamptz")
    .addColumn("last_error", "varchar(128)")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("completed_at", "timestamptz")
    .execute();

  await sql`
    alter table outbox_events
    add constraint outbox_events_status_check
    check (status in ('pending', 'processing', 'completed', 'failed'))
  `.execute(db);

  await db.schema
    .createIndex("outbox_events_idempotency_key_unique")
    .unique()
    .on("outbox_events")
    .column("idempotency_key")
    .execute();

  await db.schema
    .createIndex("outbox_events_claim_idx")
    .on("outbox_events")
    .columns(["status", "available_at", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("outbox_events").execute();
}
