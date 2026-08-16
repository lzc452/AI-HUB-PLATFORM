import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "@ai-hub/database";

/**
 * 清空 public schema 下除迁移记录外的全部表。
 * 真实 e2e 在共享 TEST_DATABASE_URL（compose 测试环境）下串行执行，
 * 每个文件开始前重置数据，避免跨文件种子冲突（如 departments 主键碰撞）。
 */
export async function resetDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  const tables = await sql<{ tablename: string }>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('kysely_migration', 'kysely_migration_lock')
  `.execute(db);
  if (tables.rows.length === 0) return;
  // 表名来自 pg_catalog，非用户输入；逐名引用以防大小写问题
  await sql
    .raw(
      `TRUNCATE TABLE ${tables.rows
        .map((row) => `"public"."${row.tablename}"`)
        .join(", ")} RESTART IDENTITY CASCADE`,
    )
    .execute(db);
}
