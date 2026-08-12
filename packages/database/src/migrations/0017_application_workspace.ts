import { sql, type Kysely } from "kysely";

/** 为应用详情、版本、审核和交付工作台补充可演进的展示数据。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_deliveries
      add column if not exists configuration jsonb not null default '{}'::jsonb,
      add column if not exists updated_by_employee_id text
  `.execute(db);

  await sql`
    create table if not exists application_assets (
      asset_id uuid primary key default gen_random_uuid(),
      application_id uuid not null references applications(application_id) on delete cascade,
      application_version_id uuid references application_versions(application_version_id) on delete cascade,
      asset_type text not null check (asset_type in ('icon', 'screenshot', 'attachment')),
      name text not null,
      storage_key text not null,
      mime_type text not null,
      size_bytes bigint not null check (size_bytes >= 0),
      sort_order integer not null default 0,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create index if not exists application_assets_application_idx
      on application_assets(application_id, asset_type, sort_order)
  `.execute(db);

  await sql`
    create table if not exists application_version_snapshots (
      snapshot_id uuid primary key default gen_random_uuid(),
      application_version_id uuid not null references application_versions(application_version_id) on delete cascade,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create table if not exists application_validation_checks (
      validation_check_id uuid primary key default gen_random_uuid(),
      application_version_id uuid not null references application_versions(application_version_id) on delete cascade,
      check_code text not null,
      label text not null,
      status text not null check (status in ('passed', 'safe', 'warning', 'info', 'failed')),
      detail text,
      created_at timestamptz not null default now(),
      unique (application_version_id, check_code)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists application_validation_checks`.execute(db);
  await sql`drop table if exists application_version_snapshots`.execute(db);
  await sql`drop table if exists application_assets`.execute(db);
  await sql`
    alter table application_deliveries
      drop column if exists configuration,
      drop column if exists updated_by_employee_id
  `.execute(db);
}
