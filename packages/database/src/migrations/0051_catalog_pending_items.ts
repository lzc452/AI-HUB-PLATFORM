import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists catalog_pending_items (
      item_id uuid primary key default gen_random_uuid(),
      application_id uuid not null references applications(application_id) on delete cascade,
      kind text not null check (kind in ('category', 'tag')),
      name varchar(120) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (application_id, kind, name)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists catalog_pending_items`.execute(db);
}
