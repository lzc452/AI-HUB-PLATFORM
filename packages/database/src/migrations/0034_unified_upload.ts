import { sql, type Kysely } from "kysely";

/** 统一上传：为上传会话增加 kind，扩展资产类型为 cover/qr。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_artifact_uploads
      add column if not exists kind varchar(32) not null default 'artifact'
  `.execute(db);

  await sql`
    alter table application_assets
      drop constraint if exists application_assets_asset_type_check
  `.execute(db);

  await sql`
    alter table application_assets
      add constraint application_assets_asset_type_check
      check (asset_type in ('icon', 'screenshot', 'cover', 'attachment', 'qr'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_assets
      drop constraint if exists application_assets_asset_type_check
  `.execute(db);

  await sql`
    alter table application_assets
      add constraint application_assets_asset_type_check
      check (asset_type in ('icon', 'screenshot', 'attachment'))
  `.execute(db);

  await sql`
    alter table application_artifact_uploads
      drop column if exists kind
  `.execute(db);
}
