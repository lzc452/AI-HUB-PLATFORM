import { sql, type Kysely } from "kysely";
import { SYSTEM_ROLE_DEFINITIONS } from "../authorization/system-roles.js";

/**
 * 为可触发通知队列（DingTalkNotificationMatrixService.queue）的角色补充
 * notification.create 权限（规格 §5.8 站内通知）：queue 的收件人校验后，
 * NotificationService.createForEvent 会对触发方执行
 * authorize({ action: "create", resourceType: "notification" })，
 * 此前没有任何系统角色授予该权限点，生产环境所有非超管的矩阵通知都会抛
 * NOT_AUTHORIZED（如需求提交、审核结论、下架申请等）。
 *
 * 与 0038 相同，本迁移幂等地把受影响角色的权限与 SYSTEM_ROLE_DEFINITIONS
 * 对齐（纯数据更新，不改表结构）。新增的角色权限点：
 * - employee：需求提交/应用责任人/维护人（demand.submitted、application.withdraw.requested 等）
 * - demand_operator / demand_reviewer：需求审核结论（demand.reviewed）
 * - risk_operator：举报处理结论（interaction.report.resolved）
 * - application_admin / analytics_operator / analytics_exporter /
 *   analytics_assistant_user：应用/分析事件触发方
 * - super_admin 已通过 "*" 获得全部权限，无需处理。
 */
const NOTIFICATION_CREATE_ROLE_CODES = new Set([
  "employee",
  "application_admin",
  "demand_operator",
  "demand_reviewer",
  "risk_operator",
  "analytics_operator",
  "analytics_exporter",
  "analytics_assistant_user",
]);

export async function up(db: Kysely<unknown>): Promise<void> {
  const roles = SYSTEM_ROLE_DEFINITIONS.filter((role) =>
    NOTIFICATION_CREATE_ROLE_CODES.has(role.roleCode),
  );
  if (roles.length !== NOTIFICATION_CREATE_ROLE_CODES.size) {
    throw new Error("SYSTEM_ROLE_DEFINITIONS_MISMATCH");
  }
  for (const role of roles) {
    await sql`
      insert into roles (role_code, name, permissions, is_system)
      values (
        ${sql.val(role.roleCode)},
        ${sql.val(role.name)},
        ${sql.val(JSON.stringify(role.permissions))}::jsonb,
        true
      )
      on conflict (role_code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = true
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const roleCodes = [...NOTIFICATION_CREATE_ROLE_CODES]
    .map((code) => `'${code}'`)
    .join(", ");
  await sql`
    update roles
    set permissions = (
      select coalesce(
        jsonb_agg(to_jsonb(permission) order by permission),
        '[]'::jsonb
      )
      from jsonb_array_elements_text(roles.permissions)
        as permission_values(permission)
      where permission <> 'notification.create'
    )
    where role_code in (${sql.raw(roleCodes)})
      and permissions ? 'notification.create'
  `.execute(db);
}
