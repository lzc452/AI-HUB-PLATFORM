import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import {
  createDatabase,
  runMigrations,
  type DatabaseSchema,
} from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { KyselyCatalogRepository } from "@ai-hub/server";
import { resetDatabase } from "./reset-database.js";

const APPLICATION_ID = "00000000-0000-0000-0000-00000000c201";
const VERSION_ID = "00000000-0000-0000-0000-00000000c202";
const DELIVERY_ID = "00000000-0000-0000-0000-00000000c203";
const ASSET_ID = "00000000-0000-0000-0000-00000000c204";

async function seedBase(db: Kysely<DatabaseSchema>): Promise<void> {
  await db
    .insertInto("departments")
    .values({
      department_id: "dept-rnd",
      name: "研发部",
      parent_department_id: null,
      source: "local",
      status: "active",
      manager_employee_id: null,
      external_id: null,
      last_synced_at: null,
    })
    .execute();
  await db
    .insertInto("catalog_categories")
    .values({
      category_id: "productivity",
      name: "效率工具",
      sort_order: 1,
      enabled: true,
      is_hot: false,
    })
    .execute();
  await db
    .insertInto("employees")
    .values({
      employee_id: "E100",
      display_name: "测试用户 E100",
      status: "active",
      primary_department_id: "dept-rnd",
      password_hash: null,
      password_reset_required: false,
    })
    .execute();
  await db
    .insertInto("applications")
    .values({
      application_id: APPLICATION_ID,
      owner_employee_id: "E100",
      maintainer_employee_id: "E100",
      department_id: "dept-rnd",
      name: "报销助手",
      summary: "小程序报销",
      status: "published",
      updated_at: new Date("2026-01-01T00:00:00Z"),
    })
    .execute();
  await db
    .insertInto("application_versions")
    .values({
      application_version_id: VERSION_ID,
      application_id: APPLICATION_ID,
      version: "1.0.0",
      changelog: "",
      artifact_key: null,
      artifact_sha256: null,
      artifact_signature: null,
      scan_status: "passed",
      created_by_employee_id: "E100",
    })
    .execute();
  await db
    .updateTable("applications")
    .set({ current_version_id: VERSION_ID })
    .where("application_id", "=", APPLICATION_ID)
    .execute();
  await db
    .insertInto("application_audiences")
    .values({
      application_id: APPLICATION_ID,
      audience_type: "all",
      department_id: null,
      employee_id: null,
      include_children: false,
    })
    .execute();
  await db
    .insertInto("application_catalog_metadata")
    .values({
      application_id: APPLICATION_ID,
      category_id: "productivity",
      application_type: "mini_program",
      search_name: "报销助手",
      search_summary: "小程序报销",
      search_pinyin: "bxzs",
      search_initials: "bxzs",
      recommendation_rank: 0,
      health_status: "healthy",
      deprecated_reason: null,
      replacement_application_id: null,
    })
    .execute();
}

describe("catalog delivery QR asset (delivery_targets.qr_code_asset_id)", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let repository: KyselyCatalogRepository;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await resetDatabase(db);
    await seedBase(db);
    repository = new KyselyCatalogRepository(db);

    await db
      .insertInto("application_deliveries")
      .values({
        delivery_id: DELIVERY_ID,
        application_id: APPLICATION_ID,
        channel: "mini_program",
        entry_url: "https://wx.miniapp.company.com/apps/baoxiao",
        min_client_version: null,
        enabled: true,
        configuration: {},
        updated_by_employee_id: "E100",
      })
      .execute();
    await db
      .insertInto("application_assets")
      .values({
        asset_id: ASSET_ID,
        application_id: APPLICATION_ID,
        application_version_id: VERSION_ID,
        asset_type: "qr",
        name: "wechat-qr.png",
        storage_key: "applications/c2/qr/wechat-qr.png",
        mime_type: "image/png",
        size_bytes: 2048,
        sort_order: 0,
        sha256: null,
        scan_status: "passed",
        uploaded_by_employee_id: "E100",
        object_etag: null,
      })
      .execute();
    await db
      .insertInto("delivery_targets")
      .values({
        delivery_target_id: "00000000-0000-0000-0000-00000000c205",
        delivery_id: DELIVERY_ID,
        kind: "miniprogram",
        os: null,
        platform: "wechat",
        arch: null,
        app_id: "wx-baoxiao",
        qr_code_asset_id: ASSET_ID,
        version_note: null,
        enabled: true,
      })
      .execute();
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("findDelivery 返回 mini_program 交付的 deliveryId", async () => {
    await expect(
      repository.findDelivery(APPLICATION_ID, "mini_program"),
    ).resolves.toEqual({
      deliveryId: DELIVERY_ID,
      entryUrl: "https://wx.miniapp.company.com/apps/baoxiao",
      enabled: true,
    });
  });

  it("findQrAssetForDelivery 返回二维码资产的存储键与 mime", async () => {
    await expect(
      repository.findQrAssetForDelivery(DELIVERY_ID),
    ).resolves.toEqual({
      storageKey: "applications/c2/qr/wechat-qr.png",
      mimeType: "image/png",
    });
  });

  it("findQrAssetForDelivery 无 miniprogram 目标或未通过扫描时返回 null", async () => {
    await expect(
      repository.findQrAssetForDelivery("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeNull();

    // 同一交付追加一条指向未通过扫描资产的 miniprogram 目标，不应被返回。
    await db
      .insertInto("application_assets")
      .values({
        asset_id: "00000000-0000-0000-0000-00000000c206",
        application_id: APPLICATION_ID,
        application_version_id: VERSION_ID,
        asset_type: "qr",
        name: "failed-qr.png",
        storage_key: "applications/c2/qr/failed-qr.png",
        mime_type: "image/png",
        size_bytes: 512,
        sort_order: 1,
        sha256: null,
        scan_status: "failed",
        uploaded_by_employee_id: "E100",
        object_etag: null,
      })
      .execute();
    await db
      .insertInto("delivery_targets")
      .values({
        delivery_target_id: "00000000-0000-0000-0000-00000000c207",
        delivery_id: DELIVERY_ID,
        kind: "miniprogram",
        os: null,
        platform: "dingtalk",
        arch: null,
        app_id: "dt-baoxiao",
        qr_code_asset_id: "00000000-0000-0000-0000-00000000c206",
        version_note: null,
        enabled: true,
      })
      .execute();
    await expect(
      repository.findQrAssetForDelivery(DELIVERY_ID),
    ).resolves.toEqual({
      storageKey: "applications/c2/qr/wechat-qr.png",
      mimeType: "image/png",
    });
  });

  it("findQrAssetForDelivery 在目标未指向资产（qr_code_asset_id 为空）时返回 null", async () => {
    await db
      .insertInto("delivery_targets")
      .values({
        delivery_target_id: "00000000-0000-0000-0000-00000000c208",
        delivery_id: DELIVERY_ID,
        kind: "miniprogram",
        os: null,
        platform: "alipay",
        arch: null,
        app_id: "ali-baoxiao",
        qr_code_asset_id: null,
        version_note: null,
        enabled: true,
      })
      .execute();
    // 原通过的 wechat 目标仍存在，先删掉它再断言空目标场景。
    await db
      .deleteFrom("delivery_targets")
      .where("delivery_target_id", "=", "00000000-0000-0000-0000-00000000c205")
      .execute();
    await expect(
      repository.findQrAssetForDelivery(DELIVERY_ID),
    ).resolves.toBeNull();
  });

  it("findApplicationIdForDelivery 返回交付归属的应用", async () => {
    await expect(
      repository.findApplicationIdForDelivery(DELIVERY_ID),
    ).resolves.toBe(APPLICATION_ID);
    await expect(
      repository.findApplicationIdForDelivery(
        "00000000-0000-0000-0000-000000000000",
      ),
    ).resolves.toBeNull();
  });
});
