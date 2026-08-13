import { sql, type Kysely } from "kysely";

/** 为崩溃后 processing 事件的 lease 回收提供小型 partial index。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists outbox_events_stale_claim_idx
      on outbox_events(claimed_at, created_at)
      where status = 'processing'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists outbox_events_stale_claim_idx`.execute(db);
}
