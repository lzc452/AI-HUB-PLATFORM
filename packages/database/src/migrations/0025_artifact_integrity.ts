import { sql, type Kysely } from "kysely";

/**
 * Artifact/交付资产完整性约束。
 * 旧 migration 保持不可变；本 migration 只收紧已存在的表，并让上传者引用
 * employee 记录，避免孤儿制品在账号归档后继续被误用。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    do $$
    begin
      if exists (
        select 1 from application_artifact_uploads where size_bytes <= 0
      ) then
        raise exception '0025_invalid_artifact_size';
      end if;
      if exists (
        select 1 from application_assets where size_bytes <= 0
      ) then
        raise exception '0025_invalid_asset_size';
      end if;
    end
    $$;
  `.execute(db);

  await sql`
    update application_delivery_assets
    set sort_order = 0
    where sort_order < 0
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      add constraint application_artifact_uploads_size_check
        check (size_bytes > 0) not valid,
      add constraint application_artifact_uploads_part_count_check
        check (part_count > 0) not valid,
      add constraint application_artifact_uploads_status_check
        check (upload_status in ('uploading', 'completed', 'failed')) not valid,
      add constraint application_artifact_uploads_scan_status_check
        check (scan_status in ('pending', 'passed', 'failed')) not valid
  `.execute(db);

  await sql`
    alter table application_assets
      add constraint application_assets_size_check
        check (size_bytes > 0) not valid,
      add constraint application_assets_scan_status_check
        check (scan_status in ('pending', 'passed', 'failed')) not valid
  `.execute(db);

  await sql`
    alter table application_delivery_assets
      add constraint application_delivery_assets_platform_check
        check (platform in ('web', 'desktop', 'mobile', 'mini_program')) not valid,
      add constraint application_delivery_assets_sort_order_check
        check (sort_order >= 0) not valid
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      add constraint application_artifact_uploads_uploader_fk
        foreign key (uploaded_by_employee_id)
        references employees(employee_id)
        on delete restrict not valid
  `.execute(db);

  await sql`
    alter table application_assets
      add constraint application_assets_uploader_fk
        foreign key (uploaded_by_employee_id)
        references employees(employee_id)
        on delete restrict not valid
  `.execute(db);

  await sql`
    create unique index if not exists application_artifact_uploads_object_key_unique
      on application_artifact_uploads(object_key)
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      validate constraint application_artifact_uploads_size_check,
      validate constraint application_artifact_uploads_part_count_check,
      validate constraint application_artifact_uploads_status_check,
      validate constraint application_artifact_uploads_scan_status_check
  `.execute(db);

  await sql`
    alter table application_assets
      validate constraint application_assets_size_check,
      validate constraint application_assets_scan_status_check
  `.execute(db);

  await sql`
    alter table application_delivery_assets
      validate constraint application_delivery_assets_platform_check,
      validate constraint application_delivery_assets_sort_order_check
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      validate constraint application_artifact_uploads_uploader_fk
  `.execute(db);

  await sql`
    alter table application_assets
      validate constraint application_assets_uploader_fk
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_assets
      drop constraint if exists application_assets_uploader_fk,
      drop constraint if exists application_assets_scan_status_check,
      drop constraint if exists application_assets_size_check
  `.execute(db);
  await sql`
    alter table application_delivery_assets
      drop constraint if exists application_delivery_assets_sort_order_check,
      drop constraint if exists application_delivery_assets_platform_check
  `.execute(db);
  await sql`
    alter table application_artifact_uploads
      drop constraint if exists application_artifact_uploads_uploader_fk,
      drop constraint if exists application_artifact_uploads_scan_status_check,
      drop constraint if exists application_artifact_uploads_status_check,
      drop constraint if exists application_artifact_uploads_part_count_check,
      drop constraint if exists application_artifact_uploads_size_check
  `.execute(db);
  await sql`drop index if exists application_artifact_uploads_object_key_unique`.execute(
    db,
  );
}
