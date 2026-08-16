import { sql, type Kysely } from "kysely";

/** Catalog 列表分页、受众过滤和批量附属数据读取所需索引。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create index if not exists applications_catalog_status_idx
    on applications(status, current_version_id, updated_at desc)`.execute(db);
  await sql`create index if not exists application_audiences_employee_idx
    on application_audiences(employee_id, application_id)`.execute(db);
  await sql`create index if not exists application_audiences_department_idx
    on application_audiences(department_id, application_id)`.execute(db);
  await sql`create index if not exists catalog_metadata_filter_idx
    on application_catalog_metadata(category_id, application_type, recommendation_rank desc)`.execute(
    db,
  );
  await sql`create index if not exists application_tag_links_app_tag_idx
    on application_tag_links(application_id, tag_id)`.execute(db);
  await sql`create index if not exists application_catalog_labels_app_idx
    on application_catalog_labels(application_id, label)`.execute(db);
  await sql`create index if not exists application_deliveries_app_enabled_idx
    on application_deliveries(application_id, enabled, channel)`.execute(db);
  await sql`create index if not exists application_assets_catalog_idx
    on application_assets(application_id, asset_type, scan_status, sort_order)`.execute(
    db,
  );
  await sql`create index if not exists application_likes_app_idx
    on application_likes(application_id)`.execute(db);
  await sql`create index if not exists application_ratings_app_idx
    on application_ratings(application_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists application_ratings_app_idx`.execute(db);
  await sql`drop index if exists application_likes_app_idx`.execute(db);
  await sql`drop index if exists application_assets_catalog_idx`.execute(db);
  await sql`drop index if exists application_deliveries_app_enabled_idx`.execute(
    db,
  );
  await sql`drop index if exists application_catalog_labels_app_idx`.execute(
    db,
  );
  await sql`drop index if exists application_tag_links_app_tag_idx`.execute(db);
  await sql`drop index if exists catalog_metadata_filter_idx`.execute(db);
  await sql`drop index if exists application_audiences_department_idx`.execute(
    db,
  );
  await sql`drop index if exists application_audiences_employee_idx`.execute(
    db,
  );
  await sql`drop index if exists applications_catalog_status_idx`.execute(db);
}
