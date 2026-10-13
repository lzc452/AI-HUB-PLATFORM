import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../schema.js";

/**
 * 0055：审核完整性约束 + 热点查询索引。
 *
 * ## 为什么这个文件只建 6 个索引而不是更多
 *
 * 本迁移在开发库上**曾经被应用过一次**（事故前的版本），kysely_migration
 * 里已存在 `0055_review_integrity_and_indexes` 记录。Kysely 按迁移名去重，
 * 同名迁移不会重跑——这意味着：
 *
 * - 开发库：下面 6 个索引**确实缺失**，需要本迁移补齐；
 * - 全新库：0001–0054 建完后，下面 6 个索引同样不存在，一次建齐；
 * - 已应用过旧版的库：整份迁移被跳过，缺失的索引不会被补上。
 *
 * 因此所有 DDL 一律用 `if not exists`。这不是「保险起见」，
 * 而是这个文件在同一个仓库里会面对三种库状态的事实要求：
 * 幂等是让「重复应用无害」的唯一手段。
 *
 * ## 索引取舍依据（全部对应已确认的查询形状，不做「以防万一」的宽索引）
 *
 * audience/department/employee 三个索引已由 0003 与 0030 建出，这里不重复声明；
 * `application_review_queue.application_version_id` 在 0003 里已带 `unique()`，
 * 也无需再建普通索引。
 *
 *注意：审核去重约束（`application_reviews_version_reviewer_unique`）是**本文件新建**的
 * （见下方 up()），并非 0003 已有—— 早前的注释误称它「已由 0003 建出」，
 * 会让维护者以为数据库层已有并发防护而不再补应用层CAS。
 *
 * 更关键的是：该约束维度是 (application_version_id, reviewer_employee_id)，
 * **两个不同审核员各写一条并不冲突**。因此它只能防「同一人重复提交」，
 * 防不住「两名审核员并发 approve 同一版本」——后者必须由应用层的
 * `completeReviewQueue` CAS（status = 'claimed'）拦住。
 */

/** 幂等地建索引。 */
async function createIndexIfAbsent(
  db: Kysely<DatabaseSchema>,
  name: string,
  statement: string,
): Promise<void> {
  await sql.raw(`create index if not exists ${name} ${statement}`).execute(db);
}

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  // ---- A. 审核去重约束 --------------------------------------------------
  //
  // 同一(版本, 审核人) 并发插入多条审核记录，后果不是「多一行数据」，
  // 而是审核结论出现分歧——页面读到的最后一条与统计口径不一致，
  // 且禁自审校验（规格 §5.5）可被绕过：审核人改一次结论就能留下
  // 「先驳回后通过」两条并存记录。
  //
  // 先清理存量重复：按 created_at 倒序保留最新一条（与「后写的为准」的
  // 阅读语义一致），其余物理删除——该表没有 active 列可做软删除。
  // 保留唯一约束而非仅靠应用层判重：check-then-insert 在并发下必然有
  // TOCTOU 窗口，数据库约束才是真正的防线。
  await sql`
    delete from application_reviews a
    using application_reviews b
    where a.application_version_id = b.application_version_id
      and a.reviewer_employee_id = b.reviewer_employee_id
      and (
        a.created_at < b.created_at
        or (a.created_at = b.created_at and a.review_id < b.review_id)
      )
  `.execute(db);

  await sql`
    create unique index if not exists application_reviews_version_reviewer_unique
    on application_reviews (application_version_id, reviewer_employee_id)
  `.execute(db);

  // 审核历史：listReviews 按 application_id + created_at 倒序。
  await createIndexIfAbsent(
    db,
    "application_reviews_application_created_idx",
    "on application_reviews (application_id, created_at desc)",
  );

  // ---- B. 热点查询索引 --------------------------------------------------
  //
  // B1. 审核工作台队列 + SLA 定时任务都按 status + sla_due_at 过滤
  //     （listExpiredReviews / listReviewsDueWithin 同一形状）。
  await createIndexIfAbsent(
    db,
    "application_review_queue_status_sla_idx",
    "on application_review_queue (status, sla_due_at)",
  );

  // B2. findReviewQueueByVersion / claim / release / complete 均以
  //     application_version_id 为入口。0003 已为该列加了unique()，
  //     唯一索引本身就是可用索引，这里**不重复建**普通索引。
  //
  // B3. 受众判定（authorization/audience-visibility.ts）的 EXISTS 子查询
  //     以 application_id 命中 application_audiences。
  //     0030 只为 employee_id / department_id 建了索引，application_id
  //     这一侧是空的——列表页每行都要做一次全表扫，是受众隔离上线后
  //     最关键的一条缺口。
  await createIndexIfAbsent(
    db,
    "application_audiences_application_idx",
    "on application_audiences (application_id)",
  );

  // B4. 受众判定的 WITH RECURSIVE 部门树：起点按 department_id 定位
  //     （0003 主键已覆盖），递归 join 的另一侧是 parent_department_id，
  //     该列当前无索引。
  await createIndexIfAbsent(
    db,
    "departments_parent_idx",
    "on departments (parent_department_id)",
  );

  // B5. listEmployeeIdsWithPermission 以 role_code 为 join 驱动侧。
  //     employee_roles 的主键是 (employee_id, role_code)，列顺序反了，
  //     支撑不了「按 role_code 查」——这是复合主键的典型陷阱。
  await createIndexIfAbsent(
    db,
    "employee_roles_role_code_idx",
    "on employee_roles (role_code)",
  );

  // B6. 权限码过滤下推用 jsonb 包含运算符 @>，没有 GIN 索引时逐行解析jsonb。
  await createIndexIfAbsent(
    db,
    "roles_permissions_gin_idx",
    "on roles using gin (permissions)",
  );
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`drop index if exists roles_permissions_gin_idx`.execute(db);
  await sql`drop index if exists employee_roles_role_code_idx`.execute(db);
  await sql`drop index if exists departments_parent_idx`.execute(db);
  await sql`drop index if exists application_audiences_application_idx`.execute(
    db,
  );
  await sql`drop index if exists application_review_queue_status_sla_idx`.execute(
    db,
  );
  await sql`drop index if exists application_reviews_application_created_idx`.execute(
    db,
  );
  // 唯一索引由 up() 以 create unique index 建立，PG 会把它登记为表约束，
  // 因此回退必须 drop constraint ——直接 drop index 会报
  // "cannot drop index ... because constraint ... requires it"。
  await sql`
    alter table application_reviews
    drop constraint if exists application_reviews_version_reviewer_unique
  `.execute(db);
}
