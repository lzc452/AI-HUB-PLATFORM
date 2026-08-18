import { sql, type Kysely } from "kysely";
import { SYSTEM_ROLE_DEFINITIONS } from "../authorization/system-roles.js";

/**
 * 补充同步 employee 系统角色权限（application.publish）。
 * 0037 已在部分环境执行过旧版本（仅 application.create），该迁移幂等地将
 * employee 权限与 SYSTEM_ROLE_DEFINITIONS 对齐，纯数据更新，不改表结构。
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
  await sql`
    update roles
    set permissions = (
      select coalesce(
        jsonb_agg(to_jsonb(permission) order by permission),
        '[]'::jsonb
      )
      from jsonb_array_elements_text(roles.permissions)
        as permission_values(permission)
      where permission <> 'application.publish'
    )
    where role_code = 'employee'
      and permissions ? 'application.publish'
  `.execute(db);
}
