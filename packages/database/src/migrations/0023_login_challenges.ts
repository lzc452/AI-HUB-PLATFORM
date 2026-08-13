import type { Kysely } from "kysely";

/** 为多 API 副本提供一次性、可过期的登录 challenge。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("login_challenges")
    .addColumn("nonce_hash", "varchar(64)", (column) => column.primaryKey())
    .addColumn("key_id", "varchar(128)", (column) => column.notNull())
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(db.fn("now")),
    )
    .execute();

  await db.schema
    .createIndex("login_challenges_expires_at_idx")
    .on("login_challenges")
    .column("expires_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("login_challenges").execute();
}
