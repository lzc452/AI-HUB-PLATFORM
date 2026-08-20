import { sql, type Kysely } from "kysely";

/** 英文旧名 → 中文兜底映射（幂等 UPDATE，仅命中英文名行）。 */
const ZH_RENAME: Readonly<Record<string, string>> = {
  Productivity: "效率工具",
  AI: "AI 智能",
  Reporting: "数据报表",
  Collaboration: "协同办公",
  Automation: "流程自动化",
};

/** 新增 10 分类（前 5 条为热门）。 */
const CATEGORIES: ReadonlyArray<{ id: string; name: string; hot: boolean }> = [
  { id: "smart_assistant", name: "智能助手", hot: true },
  { id: "document_office", name: "文档办公", hot: true },
  { id: "data_analysis", name: "数据分析", hot: true },
  { id: "image_recognition", name: "图像识别", hot: true },
  { id: "finance_tax", name: "财务税务", hot: true },
  { id: "customer_service", name: "客户服务", hot: false },
  { id: "dev_tools", name: "开发工具", hot: false },
  { id: "education_training", name: "教育培训", hot: false },
  { id: "hr_management", name: "人力资源", hot: false },
  { id: "security_compliance", name: "安全合规", hot: false },
];

/** 新增 10 标签。 */
const TAGS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "smart_assistant", name: "智能助手" },
  { id: "document_processing", name: "文档处理" },
  { id: "ocr", name: "OCR 识别" },
  { id: "data_analytics", name: "数据分析" },
  { id: "process_automation", name: "流程自动化" },
  { id: "mobile_office", name: "移动办公" },
  { id: "security_compliance", name: "安全合规" },
  { id: "report_analysis", name: "报表分析" },
  { id: "approval_flow", name: "流程审批" },
  { id: "knowledge_base", name: "知识库" },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  // 英文名 → 中文（兜底）
  for (const [english, chinese] of Object.entries(ZH_RENAME)) {
    await sql`update catalog_categories set name = ${chinese} where name = ${english}`.execute(
      db,
    );
  }
  // 热门列
  await sql`alter table catalog_categories add column if not exists is_hot boolean not null default false`.execute(
    db,
  );
  // 新增分类（幂等）
  for (const category of CATEGORIES) {
    await sql`
      insert into catalog_categories (category_id, name, sort_order, enabled, is_hot)
      values (${category.id}, ${category.name}, 10, true, ${category.hot})
      on conflict (category_id) do update set name = excluded.name, is_hot = excluded.is_hot
    `.execute(db);
  }
  // 新增标签（幂等）
  for (const tag of TAGS) {
    await sql`
      insert into catalog_tags (tag_id, name, enabled)
      values (${tag.id}, ${tag.name}, true)
      on conflict (tag_id) do update set name = excluded.name
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table catalog_categories drop column if exists is_hot`.execute(
    db,
  );
  for (const category of CATEGORIES) {
    await sql`delete from catalog_categories where category_id = ${category.id}`.execute(
      db,
    );
  }
  for (const tag of TAGS) {
    await sql`delete from catalog_tags where tag_id = ${tag.id}`.execute(db);
  }
}
