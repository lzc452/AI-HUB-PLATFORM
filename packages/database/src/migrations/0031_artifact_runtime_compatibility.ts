import { sql, type Kysely } from "kysely";

/**
 * 补齐在 0025 早期版本已标记完成、但尚未包含运行时列的数据库。
 * 这是前向兼容修复，不修改历史 migration 的执行记录。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_artifact_uploads
      add column if not exists staging_object_key text,
      add column if not exists verification_started_at timestamptz,
      add column if not exists verification_attempts integer not null default 0,
      add column if not exists updated_at timestamptz not null default now()
  `.execute(db);

  await sql`
    update application_artifact_uploads
       set staging_object_key = coalesce(staging_object_key, object_key),
           updated_at = coalesce(updated_at, created_at)
     where staging_object_key is null
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      alter column staging_object_key set not null
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      drop constraint if exists application_artifact_uploads_size_check,
      drop constraint if exists application_artifact_uploads_part_count_check,
      drop constraint if exists application_artifact_uploads_status_check,
      drop constraint if exists application_artifact_uploads_attempts_check,
      drop constraint if exists application_artifact_uploads_scan_status_check,
      drop constraint if exists application_artifact_uploads_state_check,
      drop constraint if exists application_artifact_uploads_uploader_fk
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      add constraint application_artifact_uploads_size_check
        check (size_bytes > 0) not valid,
      add constraint application_artifact_uploads_part_count_check
        check (part_count > 0) not valid,
      add constraint application_artifact_uploads_status_check
        check (upload_status in ('uploading', 'verifying', 'completed', 'failed')) not valid,
      add constraint application_artifact_uploads_attempts_check
        check (verification_attempts >= 0) not valid,
      add constraint application_artifact_uploads_scan_status_check
        check (scan_status in ('pending', 'passed', 'failed')) not valid,
      add constraint application_artifact_uploads_state_check
        check (
          (upload_status in ('uploading', 'verifying') and completed_at is null)
          or (upload_status = 'completed' and completed_at is not null and scan_status = 'passed' and sha256 is not null and signature is not null)
          or (upload_status = 'failed' and error_code is not null)
        ) not valid
  `.execute(db);

  await sql`
    create unique index if not exists application_artifact_uploads_object_key_unique
      on application_artifact_uploads(object_key)
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      add constraint application_artifact_uploads_uploader_fk
        foreign key (uploaded_by_employee_id)
        references employees(employee_id)
        on delete restrict
        not valid
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      validate constraint application_artifact_uploads_size_check,
      validate constraint application_artifact_uploads_part_count_check,
      validate constraint application_artifact_uploads_status_check,
      validate constraint application_artifact_uploads_attempts_check,
      validate constraint application_artifact_uploads_state_check,
      validate constraint application_artifact_uploads_scan_status_check,
      validate constraint application_artifact_uploads_uploader_fk
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_artifact_uploads
      drop constraint if exists application_artifact_uploads_uploader_fk,
      drop constraint if exists application_artifact_uploads_scan_status_check,
      drop constraint if exists application_artifact_uploads_state_check,
      drop constraint if exists application_artifact_uploads_attempts_check,
      drop constraint if exists application_artifact_uploads_status_check,
      drop constraint if exists application_artifact_uploads_part_count_check,
      drop constraint if exists application_artifact_uploads_size_check,
      drop column if exists staging_object_key,
      drop column if exists verification_started_at,
      drop column if exists verification_attempts,
      drop column if exists updated_at
  `.execute(db);
  await sql`drop index if exists application_artifact_uploads_object_key_unique`.execute(
    db,
  );
}
