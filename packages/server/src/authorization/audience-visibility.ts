import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "@ai-hub/database";
import type { ActorContext } from "@ai-hub/contracts";

/**
 * 受众可见性判定（application_audiences）。
 *
 * 语义（与 application_audiences 的 check 约束一致）：
 * - `all`：所有人可见；
 * - `department`：受众部门的直属员工可见；`include_children = true` 时
 *   该部门的**所有子孙部门**员工同样可见；
 * - `employee`：指定员工可见；
 * - **一个应用没有任何受众记录 = 无人可见**（受限应用）。
 *
 * 关键点：可见性是「应用级」的，不是「行级」的——同一应用的所有行对同一
 * actor 的可见性一致，因此判定写成 EXISTS 子查询并以 application_id 关联，
 * 可直接嵌入任意 SELECT 的 where，不改变行数。
 *
 * 放在 authorization/ 而非 portal/ 或 catalog/：受众是访问控制语义，Portal、
 * Catalog、资产下载三条路径都必须复用同一份判定，任何一处自行实现都会出现
 * 「列表看不到但能直接按 ID 访问」的越权缺口。
 */

/**
 * actor 的部门集合用于部门受众匹配。
 *
 * `ActorContext.departmentIds` 只含**直属**部门（见
 * `KyselyIdentityRepository.listEmployeeDepartmentIds`），因此需要在 SQL 侧
 * 从受众部门向下展开子树，再与 actor 的直属部门求交。这与 demand 的受众判定
 * 方向一致（都是「从受众部门向下展开」），而不是预先把员工部门展开成全集——
 * 后者会让每次请求多一次查询。
 */
function departmentIdList(departmentIds: readonly string[]) {
  if (departmentIds.length === 0) return sql`null`;
  return sql.join(
    departmentIds.map((departmentId) => sql`${departmentId}`),
    sql`, `,
  );
}

export interface AudienceVisibilityParams {
  /** 引用当前查询中的应用 ID 列，例如 `a.application_id`。 */
  applicationIdRef: string;
  /** 匿名访问为 null。 */
  actor: ActorContext | null;
  /**
   * 引用当前查询中的应用状态列。**传入时受众判定只约束已发布应用**：
   * 非发布应用一律放行，交给owner/maintainer/审核员的发布态门禁处理。
   *
   * 这一条不是可选的礼貌性设计：受众记录是在「提交审核」时才写入的
   * （`DRAFT_AUDIENCE_REQUIRED` → `replaceAudiences`），草稿必然没有受众行。
   * 若不加状态豁免，owner 会在提交前就看不到自己的草稿，编辑流程直接死锁。
   */
  statusRef?: string;
}

/**
 * 构造「该actor 可见的应用」布尔表达式，可直接嵌入任意 SELECT 的 where。
 *
 * 匿名（actor 为 null）只能看到 `all` 受众的应用；应用无受众记录时对任何人
 * 都不可见——这正是 EXISTS 子查询的天然行为（无行 → false）。
 *
 * @param applicationIdRef 应用 ID 列的引用文本（不含引号）。raw SQL 中写
 *   `a.application_id`，Kysely query builder 中同样写带表别名的列名——
 *   内部走 sql.ref做标识符引用，不作为绑定参数下发。
 */
export function audienceVisibilityCondition({
  applicationIdRef,
  actor,
  statusRef,
}: AudienceVisibilityParams) {
  // 必须走 sql.ref 而不是直接插值：`${value}` 在 Kysely 的 sql 模板里是
  // **绑定参数**（pg 侧看到的是 $1），写成 `${"a.application_id"}` 会得到
  // `application_id = $1`，把列名字面量当 uuid 传给 PG，报
  // `invalid input syntax for type uuid`。sql.ref 才是标识符引用。
  const applicationId = sql.ref(applicationIdRef);
  const audienceGate = audienceMatch({ applicationId, actor });

  if (statusRef === undefined) return audienceGate;
  // 非发布态不受众约束（见 AudienceVisibilityParams.statusRef 的说明）。
  return sql<boolean>`(${sql.ref(statusRef)} <> 'published' or ${audienceGate})`;
}

function audienceMatch({
  applicationId,
  actor,
}: {
  applicationId: ReturnType<typeof sql.ref>;
  actor: ActorContext | null;
}) {
  if (actor === null) {
    return sql<boolean>`exists (
      select 1 from application_audiences anon_audience
      where anon_audience.application_id = ${applicationId}
        and anon_audience.audience_type = 'all'
    )`;
  }

  const departments = departmentIdList(actor.departmentIds);

  return sql<boolean>`exists (
    select 1 from application_audiences vis_audience
    where vis_audience.application_id = ${applicationId}
      and (
        vis_audience.audience_type = 'all'
        or vis_audience.employee_id = ${actor.employeeId}
        or (
          vis_audience.audience_type = 'department'
          and (
            vis_audience.department_id in (${departments})
            or (
              vis_audience.include_children = true
              and exists (
                with recursive visible_department_tree as (
                  select d.department_id from departments d
                  where d.department_id = vis_audience.department_id
                  union all
                  select child.department_id from departments child
                  inner join visible_department_tree parent
                    on child.parent_department_id = parent.department_id
                )
                select 1
                from visible_department_tree
                where department_id in (${departments})
              )
            )
          )
        )
      )
  )`;
}

/**
 * 判断单个应用对当前 actor 是否可见（供按 ID 精确访问的路径使用）。
 *
 * 与 {@link audienceVisibilityCondition} 共用同一份判定，区别只在于输出的是
 * 单个布尔值而非可嵌入的表达式——避免调用方自己拼 where 时漏掉状态豁免。
 */
export async function isApplicationVisible(
  db: Kysely<DatabaseSchema>,
  actor: ActorContext | null,
  applicationId: string,
): Promise<boolean> {
  const allowed = await sql<{ allowed: boolean }>`
    select ${audienceVisibilityCondition({
      applicationIdRef: "probe.application_id",
      statusRef: "probe.status",
      actor,
    })} as allowed
    from applications probe
    where probe.application_id = ${applicationId}
  `.execute(db);
  return allowed.rows[0]?.allowed === true;
}