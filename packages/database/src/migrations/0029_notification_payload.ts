import { sql, type Kysely } from "kysely";

/** 为通知列表和详情提供同一份结构化 payload。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table notifications
      add column if not exists payload jsonb not null default '{}'::jsonb
  `.execute(db);
  await sql`
    update notifications
       set payload = jsonb_build_object('title', message, 'body', message)
     where payload = '{}'::jsonb
  `.execute(db);
  await sql`
    alter table notifications
      drop constraint if exists notifications_payload_object_check,
      add constraint notifications_payload_object_check
        check (jsonb_typeof(payload) = 'object')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table notifications
      drop constraint if exists notifications_payload_object_check,
      drop column if exists payload
  `.execute(db);
}
