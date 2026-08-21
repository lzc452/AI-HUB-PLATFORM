import {
  createDatabase,
  seedDemoDataset,
  assertDemoDataSafety,
  resolveAnchorDate,
} from "@ai-hub/database";

const nodeEnv = process.env.NODE_ENV ?? "development";

assertDemoDataSafety({
  nodeEnv,
  demoDataEnabled: process.env.DEMO_DATA_ENABLED,
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const anchorDate = resolveAnchorDate(process.env.DEMO_ANCHOR_DATE);
const db = createDatabase(databaseUrl);

try {
  const result = await seedDemoDataset(db, {
    anchorDate,
    mode: "upsert",
    domains: [
      "identity",
      "application",
      "catalog",
      "demand",
      "notification",
      "analytics",
    ],
  });
  console.log(JSON.stringify(result, null, 2));
  await seedDemoAttachments(db);
  console.log(`Seed complete in ${result.durationMs}ms`);
} finally {
  await db.destroy();
}

/**
 * demo 附件：为前两个已发布应用写入占位附件文件（磁盘存储驱动）并插入
 * application_assets 行（scan_status=passed），使详情页"相关附件"有真实可下载数据。
 * - 仅磁盘驱动（OBJECT_STORAGE_DRIVER=disk，本地默认）生效；Garage 驱动跳过。
 * - 文件写入 STORAGE_DIRECTORY（默认 .storage/artifacts）；docker 环境需将该
 *   目录挂载进 api 容器才能被读取（compose.dev.yaml 可自行 bind）。
 * - asset_id 由 storage key 派生（确定性 uuid），重复执行幂等。
 */
async function seedDemoAttachments(
  db: ReturnType<typeof createDatabase>,
): Promise<void> {
  const driver = process.env.OBJECT_STORAGE_DRIVER ?? "disk";
  if (driver !== "disk") {
    console.log("seedDemoAttachments: 跳过（仅磁盘存储驱动支持 demo 附件）");
    return;
  }
  const storageRoot = process.env.STORAGE_DIRECTORY ?? ".storage/artifacts";
  const { createHash } = await import("node:crypto");
  const { mkdirSync, statSync, writeFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");

  const apps = await db
    .selectFrom("applications")
    .select(["application_id", "name"])
    .where("status", "=", "published")
    .limit(2)
    .execute();

  for (const app of apps) {
    const attachments = [
      {
        name: `${app.name}-使用手册.pdf`,
        mime: "application/pdf",
      },
      {
        name: `${app.name}-部署指南.docx`,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ];
    for (const [index, attachment] of attachments.entries()) {
      const key = `apps/${app.application_id}/attachments/${attachment.name}`;
      // 确定性 uuid：由 key 的 md5 派生（幂等，重复 seed 不产生重复行）。
      const md5 = createHash("md5").update(key).digest("hex");
      const assetId = `${md5.slice(0, 8)}-${md5.slice(8, 12)}-${md5.slice(12, 16)}-${md5.slice(16, 20)}-${md5.slice(20, 32)}`;
      const target = join(storageRoot, key);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        `AI Hub 平台 demo 种子附件：${attachment.name}\n本文件由 seed-demo-data 生成，用于演示附件下载。\n`,
      );
      await db
        .insertInto("application_assets")
        .values({
          asset_id: assetId,
          application_id: app.application_id,
          application_version_id: null,
          asset_type: "attachment",
          name: attachment.name,
          storage_key: key,
          mime_type: attachment.mime,
          size_bytes: statSync(target).size,
          sort_order: index,
          sha256: null,
          scan_status: "passed",
          uploaded_by_employee_id: null,
          created_at: new Date(),
        })
        .onConflict((oc) => oc.column("asset_id").doNothing())
        .execute();
    }
  }
  console.log(`seedDemoAttachments: 为 ${apps.length} 个应用写入 demo 附件`);
}
