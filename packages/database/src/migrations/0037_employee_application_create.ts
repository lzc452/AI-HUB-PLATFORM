import { sql, type Kysely } from "kysely";
import { PERMISSIONS } from "@ai-hub/contracts";
import { SYSTEM_ROLE_DEFINITIONS } from "../authorization/system-roles.js";

/**
 * 需求规格（§5.4 应用发布）：所有正常员工都可以创建草稿和提交应用。
 * 将数据库 registry 中 employee 系统角色的权限与 SYSTEM_ROLE_DEFINITIONS
 * 对齐（纯数据更新，不改表结构），补齐 application.create。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const employeeRole = SYSTEM_ROLE_DEFINITIONS.find(
    (role) => role.roleCode === "employee",
  );
  if (employeeRole === undefined) {
    throw new Error("SYSTEM_ROLE_EMPLOYEE_MISSING");
  }
  await sql`
    insert into roles (role_code, name, permissions, is_system)
    values (
      ${sql.val(employeeRole.roleCode)},
      ${sql.val(employeeRole.name)},
      ${sql.val(JSON.stringify(employeeRole.permissions))}::jsonb,
      true
    )
    on conflict (role_code) do update
      set name = excluded.name,
          permissions = excluded.permissions,
          is_system = true
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // 回滚：仅移除本次授予普通员工的 application.create，保留其他权限。
  await sql`
    update roles
    set permissions = (
      select coalesce(
        jsonb_agg(to_jsonb(permission) order by permission),
        '[]'::jsonb
      )
      from jsonb_array_elements_text(roles.permissions)
        as permission_values(permission)
      where permission <> ${sql.val(PERMISSIONS.APPLICATION_CREATE)}
    )
    where role_code = 'employee'
      and permissions ? ${sql.val(PERMISSIONS.APPLICATION_CREATE)}
  `.execute(db);
}
