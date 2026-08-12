import { sql, type Kysely } from "kysely";

/** 组织管理字段与同步任务：部门/角色管理字段、同步任务明细与配置。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table departments
      add column if not exists status text not null default 'active',
      add column if not exists manager_employee_id text,
      add column if not exists external_id text,
      add column if not exists last_synced_at timestamptz
  `.execute(db);

  await sql`
    alter table departments
      drop constraint if exists departments_status_check
  `.execute(db);
  await sql`
    alter table departments
      add constraint departments_status_check check (status in ('active', 'disabled'))
  `.execute(db);

  await sql`
    create index if not exists departments_manager_idx on departments(manager_employee_id)
  `.execute(db);
  await sql`
    create index if not exists departments_status_source_idx on departments(status, source)
  `.execute(db);

  await sql`
    alter table roles
      add column if not exists status text not null default 'active',
      add column if not exists created_by_employee_id text,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()
  `.execute(db);

  await sql`
    alter table roles
      drop constraint if exists roles_status_check
  `.execute(db);
  await sql`
    alter table roles
      add constraint roles_status_check check (status in ('active', 'disabled'))
  `.execute(db);

  await sql`
    create table if not exists identity_sync_run_items (
      sync_run_item_id uuid primary key default gen_random_uuid(),
      sync_run_id uuid not null references dingtalk_sync_runs(sync_run_id) on delete cascade,
      object_type text not null,
      object_id text not null,
      status text not null default 'pending',
      processed_count integer not null default 0,
      success_count integer not null default 0,
      failure_count integer not null default 0,
      error_code text,
      started_at timestamptz,
      finished_at timestamptz,
      retry_of_item_id uuid references identity_sync_run_items(sync_run_item_id),
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create index if not exists identity_sync_run_items_run_idx
      on identity_sync_run_items(sync_run_id, status)
  `.execute(db);

  await sql`
    create table if not exists identity_sync_config (
      id boolean primary key default true,
      enabled boolean not null default false,
      schedule text,
      external_org_id text,
      secret_reference text,
      last_updated_by_employee_id text,
      updated_at timestamptz not null default now()
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists identity_sync_config`.execute(db);
  await sql`drop table if exists identity_sync_run_items`.execute(db);

  await sql`
    alter table roles
      drop column if exists status,
      drop column if exists created_by_employee_id,
      drop column if exists created_at,
      drop column if exists updated_at
  `.execute(db);

  await sql`drop index if exists departments_status_source_idx`.execute(db);
  await sql`drop index if exists departments_manager_idx`.execute(db);

  await sql`
    alter table departments
      drop column if exists status,
      drop column if exists manager_employee_id,
      drop column if exists external_id,
      drop column if exists last_synced_at
  `.execute(db);
}
