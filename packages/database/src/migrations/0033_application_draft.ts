import { sql, type Kysely } from "kysely";

/** 创建应用分步表单的整表单草稿存储（一份 draft JSON）。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists application_drafts (
      application_id uuid primary key references applications(application_id) on delete cascade,
      draft jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists application_drafts`.execute(db);
}
