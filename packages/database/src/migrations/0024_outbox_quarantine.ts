import { sql, type Kysely } from "kysely";

/** 为未知事件类型提供可观测、不可重试且保留原始 payload 的隔离终态。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table outbox_events
      drop constraint if exists outbox_events_status_check
  `.execute(db);
  await sql`
    alter table outbox_events
      add constraint outbox_events_status_check
      check (status in ('pending', 'processing', 'completed', 'failed', 'quarantined'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    update outbox_events
       set status = 'failed',
           last_error = coalesce(last_error, 'OUTBOX_EVENT_TYPE_UNSUPPORTED')
     where status = 'quarantined'
  `.execute(db);
  await sql`
    alter table outbox_events
      drop constraint if exists outbox_events_status_check
  `.execute(db);
  await sql`
    alter table outbox_events
      add constraint outbox_events_status_check
      check (status in ('pending', 'processing', 'completed', 'failed'))
  `.execute(db);
}
