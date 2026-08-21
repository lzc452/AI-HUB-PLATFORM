import { sql, type Kysely } from "kysely";

/**
 * application_assets.asset_type 扩展 'artifact'：创建应用向导上传安装包
 * （unified upload kind=artifact）后经 complete 创建资产行，供交付渠道关联下载。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_assets
      drop constraint if exists application_assets_asset_type_check
  `.execute(db);
  await sql`
    alter table application_assets
      add constraint application_assets_asset_type_check
      check (asset_type in ('icon', 'screenshot', 'cover', 'attachment', 'qr', 'artifact'))
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
      check (asset_type in ('icon', 'screenshot', 'cover', 'attachment', 'qr'))
  `.execute(db);
}
