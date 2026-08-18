import { sql, type Kysely } from "kysely";

/**
 * 搜索升级：pg_trgm 扩展 + application_metadata 搜索列的 GIN trgm 索引。
 *
 * gin_trgm_ops 可加速：
 * - `ILIKE '%x%'` 中缀模式（trgm 通配符匹配）
 * - `%` 相似度运算符（`pg_trgm.similarity()` 之上的布尔判定）
 *
 * 精确/前缀匹配（`= 'x'`、`LIKE 'x%'`）仍由 trgm 索引覆盖（等值模式按
 * 精确 trigram 集合判定），无需额外 btree。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pg_trgm`.execute(db);
  await sql`
    create index if not exists catalog_search_name_trgm
    on application_catalog_metadata using gin (search_name gin_trgm_ops)
  `.execute(db);
  await sql`
    create index if not exists catalog_search_summary_trgm
    on application_catalog_metadata using gin (search_summary gin_trgm_ops)
  `.execute(db);
  await sql`
    create index if not exists catalog_search_pinyin_trgm
    on application_catalog_metadata using gin (search_pinyin gin_trgm_ops)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists catalog_search_name_trgm`.execute(db);
  await sql`drop index if exists catalog_search_summary_trgm`.execute(db);
  await sql`drop index if exists catalog_search_pinyin_trgm`.execute(db);
  await sql`drop extension if exists pg_trgm`.execute(db);
}
