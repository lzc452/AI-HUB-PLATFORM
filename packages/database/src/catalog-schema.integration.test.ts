import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { createDatabase, runMigrations } from "./index.js";

describe("catalog schema (0050 zh seed + is_hot)", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("adds is_hot column to catalog_categories (not null, default false)", async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'catalog_categories'
        and column_name = 'is_hot'
    `.execute(db);

    expect(columns.rows).toHaveLength(1);

    const meta = await sql<{
      is_nullable: string;
      column_default: string | null;
    }>`
      select is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'catalog_categories'
        and column_name = 'is_hot'
    `.execute(db);
    expect(meta.rows[0]).toMatchObject({
      is_nullable: "NO",
      column_default: "false",
    });
  });

  it("seeds the 10 new categories (5 hot) and 10 tags (migrations-only DB)", async () => {
    // 原始 5 分类/8 标签来自 demo seed（非迁移），此处数据库仅跑迁移 →
    // 0050 落地后应恰为 10 分类（5 hot）+ 10 标签，证明迁移已执行。
    const categories = await sql<{ total: number; hot: number }>`
      select
        count(*)::int as total,
        count(*) filter (where is_hot)::int as hot
      from catalog_categories
    `.execute(db);
    expect(categories.rows[0]).toEqual({ total: 10, hot: 5 });

    const tags = await sql<{ total: number }>`
      select count(*)::int as total from catalog_tags
    `.execute(db);
    expect(tags.rows[0]).toEqual({ total: 10 });

    // New categories carry the zh names / sort_order continuation (6..15)
    const newCategories = await sql<{
      category_id: string;
      name: string;
      sort_order: number;
    }>`
      select category_id, name, sort_order
      from catalog_categories
      where category_id in (
        'smart_assistant', 'document_office', 'data_analysis',
        'image_recognition', 'finance_tax', 'customer_service',
        'dev_tools', 'education_training', 'hr_management',
        'security_compliance'
      )
      order by sort_order
    `.execute(db);
    expect(
      newCategories.rows.map((row) => ({
        id: row.category_id,
        name: row.name,
        sort_order: row.sort_order,
      })),
    ).toEqual([
      { id: "smart_assistant", name: "智能助手", sort_order: 6 },
      { id: "document_office", name: "文档办公", sort_order: 7 },
      { id: "data_analysis", name: "数据分析", sort_order: 8 },
      { id: "image_recognition", name: "图像识别", sort_order: 9 },
      { id: "finance_tax", name: "财务税务", sort_order: 10 },
      { id: "customer_service", name: "客户服务", sort_order: 11 },
      { id: "dev_tools", name: "开发工具", sort_order: 12 },
      { id: "education_training", name: "教育培训", sort_order: 13 },
      { id: "hr_management", name: "人力资源", sort_order: 14 },
      { id: "security_compliance", name: "安全合规", sort_order: 15 },
    ]);

    const hotIds = await sql<{ category_id: string }>`
      select category_id from catalog_categories where is_hot order by category_id
    `.execute(db);
    expect(hotIds.rows.map((row) => row.category_id)).toEqual([
      "data_analysis",
      "document_office",
      "finance_tax",
      "image_recognition",
      "smart_assistant",
    ]);

    const newTags = await sql<{ tag_id: string }>`
      select tag_id from catalog_tags
      where tag_id in (
        'smart_assistant', 'document_processing', 'ocr', 'data_analytics',
        'process_automation', 'mobile_office', 'security_compliance',
        'report_analysis', 'approval_flow', 'knowledge_base'
      )
    `.execute(db);
    expect(newTags.rows.map((row) => row.tag_id).sort()).toEqual([
      "approval_flow",
      "data_analytics",
      "document_processing",
      "knowledge_base",
      "mobile_office",
      "ocr",
      "process_automation",
      "report_analysis",
      "security_compliance",
      "smart_assistant",
    ]);
  });
});
