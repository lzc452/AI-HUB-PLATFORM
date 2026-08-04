import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("request_replay_nonces")
    .addColumn("nonce_hash", "varchar(64)", (column) => column.primaryKey())
    .addColumn("actor_employee_id", "varchar(128)", (column) =>
      column.notNull(),
    )
    .addColumn("route", "varchar(512)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo("now()"),
    )
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .execute();

  await db.schema
    .createIndex("request_replay_nonces_expires_at_idx")
    .on("request_replay_nonces")
    .column("expires_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("request_replay_nonces").execute();
}
