import { sql, type Kysely } from "kysely";

/**
 * 支持「已发布应用提交更新进入审核」的状态机：
 *
 * - `applications.pending_version_id`：发布中处于审核的待生效版本，
 *   发布应用提交更新审核时写入，审批通过/驳回后置空。
 * - `application_review_queue.source_status`：进入审核前的应用状态
 *   （'draft' 或 'published'），用于驳回时正确回滚到原状态。
 * - `application_review_queue.status` 增加 'completed'：审核结束（通过或驳回）
 *   后将队列置为终态，避免其继续以 available/claimed 残留。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("applications")
    .addColumn("pending_version_id", "uuid", (column) =>
      column.references("application_versions.application_version_id"),
    )
    .execute();

  await db.schema
    .alterTable("application_review_queue")
    .addColumn("source_status", "varchar(16)")
    .execute();

  await sql`
    alter table application_review_queue
    drop constraint if exists application_review_queue_status_check
  `.execute(db);

  await sql`
    alter table application_review_queue
    add constraint application_review_queue_status_check
    check (status in ('available', 'claimed', 'completed'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // 回滚前将已结束（completed）的队列归位，否则重新加回的两值约束会失败。
  await sql`
    update application_review_queue
    set status = 'available'
    where status = 'completed'
  `.execute(db);

  await sql`
    alter table application_review_queue
    drop constraint if exists application_review_queue_status_check
  `.execute(db);

  await sql`
    alter table application_review_queue
    add constraint application_review_queue_status_check
    check (status in ('available', 'claimed'))
  `.execute(db);

  await db.schema
    .alterTable("application_review_queue")
    .dropColumn("source_status")
    .execute();

  await db.schema
    .alterTable("applications")
    .dropColumn("pending_version_id")
    .execute();
}
