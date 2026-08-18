import { sql, type Kysely } from "kysely";

/**
 * 为 application_likes 增加独立行标识 like_id：
 *
 * - 0004 用复合主键 (application_id, employee_id) 标识点赞行，
 *   行为事件幂等键只能拼 Date.now()，同毫秒重复点击会丢事件。
 * - 本迁移将 like_id (bigserial) 设为新的主键，行为事件用
 *   `application-liked:${like_id}` 作为稳定幂等键；
 * - 同时用唯一约束保留 (application_id, employee_id) 的互斥语义，
 *   保证 addLike 的 on conflict do nothing 行为不变。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_likes
    drop constraint application_likes_pk
  `.execute(db);

  await sql`
    alter table application_likes
    add column like_id bigserial primary key
  `.execute(db);

  await sql`
    alter table application_likes
    add constraint application_likes_app_employee_uniq
    unique (application_id, employee_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_likes
    drop constraint if exists application_likes_app_employee_uniq
  `.execute(db);

  // drop column 会连带删除依赖它的主键约束（application_likes_pkey）。
  await sql`
    alter table application_likes
    drop column if exists like_id
  `.execute(db);

  await sql`
    alter table application_likes
    add constraint application_likes_pk
    primary key (application_id, employee_id)
  `.execute(db);
}
