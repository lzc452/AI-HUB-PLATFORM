import { sql, type Kysely } from "kysely";

/** Artifact 上传会话、资产安全字段与交付资产映射。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists application_artifact_uploads (
      upload_id uuid primary key default gen_random_uuid(),
      application_id uuid not null references applications(application_id) on delete cascade,
      uploaded_by_employee_id text not null,
      object_key text not null,
      file_name text not null,
      mime_type text not null,
      size_bytes bigint not null check (size_bytes >= 0),
      sha256 text,
      signature text,
      part_count integer not null default 1,
      upload_status text not null default 'uploading',
      scan_status text not null default 'pending',
      error_code text,
      expires_at timestamptz not null,
      completed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create index if not exists application_artifact_uploads_application_idx
      on application_artifact_uploads(application_id, created_at)
  `.execute(db);

  await sql`
    alter table application_assets
      add column if not exists sha256 text,
      add column if not exists scan_status text not null default 'pending',
      add column if not exists uploaded_by_employee_id text,
      add column if not exists object_etag text,
      add column if not exists updated_at timestamptz not null default now()
  `.execute(db);

  await sql`
    create table if not exists application_delivery_assets (
      delivery_id uuid not null references application_deliveries(delivery_id) on delete cascade,
      platform text not null,
      asset_id uuid not null references application_assets(asset_id) on delete cascade,
      version text,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      primary key (delivery_id, platform, asset_id)
    )
  `.execute(db);

  await sql`
    create unique index if not exists application_versions_artifact_key_unique
      on application_versions(artifact_key)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists application_versions_artifact_key_unique`.execute(
    db,
  );
  await sql`drop table if exists application_delivery_assets`.execute(db);

  await sql`
    alter table application_assets
      drop column if exists sha256,
      drop column if exists scan_status,
      drop column if exists uploaded_by_employee_id,
      drop column if exists object_etag,
      drop column if exists updated_at
  `.execute(db);

  await sql`drop index if exists application_artifact_uploads_application_idx`.execute(
    db,
  );
  await sql`drop table if exists application_artifact_uploads`.execute(db);
}
