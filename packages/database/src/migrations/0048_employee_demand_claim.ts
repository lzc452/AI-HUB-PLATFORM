import { sql, type Kysely } from "kysely";
import { SYSTEM_ROLE_DEFINITIONS } from "../authorization/system-roles.js";

/**
 * 为 employee 系统角色补充 demand.claim 权限（规格 §5.9 任意正常员工可以
 * 提交认领方案）：POST /demands/:id/claim-proposals 的
 * @RequiresPermissions(DEMAND_CLAIM) 此前仅 demand_operator /
 * demand_reviewer 持有，普通员工提交认领方案会抛 NOT_AUTHORIZED，且前端
 * 认领方案表单（DemandGovernanceDrawer）同因 can(DEMAND_CLAIM) 隐藏。
 *
 * 与 0038/0044 相同，本迁移幂等地把 employee 角色权限与
 * SYSTEM_ROLE_DEFINITIONS 对齐（纯数据更新，不改表结构）。
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
      where permission <> 'demand.claim'
    )
    where role_code = 'employee'
      and permissions ? 'demand.claim'
  `.execute(db);
}
