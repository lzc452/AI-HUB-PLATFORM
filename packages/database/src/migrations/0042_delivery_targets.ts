import { sql, type Kysely } from "kysely";

/**
 * 交付目标（delivery_targets）：交付渠道下的细分目标元数据。
 *
 * - desktop：目标 OS（windows/macos）与架构
 * - mobile：目标平台（android/ios）与架构
 * - miniprogram：小程序平台（wechat/dingtalk/alipay）、appId 与二维码资产
 *   （qr_code_asset_id → application_assets.asset_id；二维码内容保存时经
 *   validateMiniProgramQr 校验）
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists delivery_targets (
      delivery_target_id uuid primary key default gen_random_uuid(),
      delivery_id uuid not null references application_deliveries(delivery_id) on delete cascade,
      kind text not null check (kind in ('desktop', 'mobile', 'miniprogram')),
      os text,
      platform text,
      arch text,
      app_id text,
      qr_code_asset_id uuid references application_assets(asset_id) on delete set null,
      version_note text,
      enabled boolean not null default true,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create index if not exists delivery_targets_delivery_id_idx
      on delivery_targets(delivery_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists delivery_targets`.execute(db);
}
