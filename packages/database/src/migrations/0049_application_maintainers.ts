import { sql, type Kysely } from "kysely";

/**
 * 应用维护人关联表（链路 2 P1-6 维护人字段落地）。
 *
 * 向导必填收集 draft.maintainerEmployeeIds（多维护人数组），但 applications
 * 只有单列 maintainer_employee_id（0003 迁移，创建时写入一次）。本迁移新建
 * application_maintainers 关联表持久化完整维护人列表：
 * - submitDraft / saveDraft 以先删后插方式同步该表（主维护人 = 数组第一个，
 *   同时回写 applications.maintainer_employee_id 保持既有单列读取路径有效）；
 * - 详情/工作区的维护人显示与自审守卫（isSelfReviewer）优先从关联表读取。
 *
 * 存量数据回填：applications.maintainer_employee_id 作为首条关联行，保持
 * 历史应用的维护人语义不变。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("application_maintainers")
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("application_maintainers_pk", [
      "application_id",
      "employee_id",
    ])
    .execute();

  await sql`
    insert into application_maintainers (application_id, employee_id)
    select application_id, maintainer_employee_id
    from applications
    on conflict (application_id, employee_id) do nothing
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("application_maintainers").execute();
}
