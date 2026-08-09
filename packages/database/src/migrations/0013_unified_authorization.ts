import { sql, type Kysely } from "kysely";
import { PERMISSIONS } from "@ai-hub/contracts";
import { SYSTEM_ROLE_DEFINITIONS } from "../authorization/system-roles.js";

const roleCodes = SYSTEM_ROLE_DEFINITIONS.map((role) => role.roleCode);

export async function up(db: Kysely<unknown>): Promise<void> {
  const registryRoleCodes = sql.join(
    roleCodes.map((roleCode) => sql.val(roleCode)),
  );

  await sql`
    create table authorization_0013_snapshot (
      snapshot_id boolean primary key,
      roles jsonb not null,
      employee_roles jsonb not null,
      metrics jsonb not null
    )
  `.execute(db);
  await sql`
    insert into authorization_0013_snapshot (snapshot_id, roles, employee_roles, metrics)
    values (
      true,
      coalesce((select jsonb_agg(to_jsonb(role)) from roles role), '[]'::jsonb),
      coalesce((select jsonb_agg(to_jsonb(employee_role)) from employee_roles employee_role where employee_role.role_code in (${registryRoleCodes})), '[]'::jsonb),
      coalesce((select jsonb_agg(to_jsonb(metric)) from analytics_metric_definitions metric where metric.required_permission like 'analytics:%'), '[]'::jsonb)
    )
  `.execute(db);

  // 仅由 registry 覆盖规范系统角色；未知系统角色和自定义角色记录保留，后续只转换其中的已知旧权限别名。
  for (const role of SYSTEM_ROLE_DEFINITIONS) {
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

  await sql`
    insert into employee_roles (employee_id, role_code)
    select employee_id, 'employee'
    from employees
    where status = 'active'
    on conflict (employee_id, role_code) do nothing
  `.execute(db);

  // 将已知旧权限别名转换为规范点号权限；未知自定义权限保持原值。
  await sql`
    update roles
    set permissions = (
      select coalesce(jsonb_agg(to_jsonb(permission) order by permission), '[]'::jsonb)
      from (
        select distinct case value
          when 'marketplace.read' then ${sql.val(PERMISSIONS.CATALOG_READ)}
          when 'analytics:platform:read' then ${sql.val(PERMISSIONS.ANALYTICS_PLATFORM_READ)}
          when 'analytics:market:read' then ${sql.val(PERMISSIONS.ANALYTICS_MARKET_READ)}
          when 'analytics:application:read' then ${sql.val(PERMISSIONS.ANALYTICS_APPLICATION_READ)}
          when 'analytics:innovation:read' then ${sql.val(PERMISSIONS.ANALYTICS_INNOVATION_READ)}
          when 'analytics:review:read' then ${sql.val(PERMISSIONS.ANALYTICS_REVIEW_READ)}
          when 'analytics:department:read' then ${sql.val(PERMISSIONS.ANALYTICS_DEPARTMENT_READ)}
          when 'analytics:risk:read' then ${sql.val(PERMISSIONS.ANALYTICS_RISK_READ)}
          when 'analytics:runtime:read' then ${sql.val(PERMISSIONS.ANALYTICS_RUNTIME_READ)}
          when 'analytics:integration:read' then ${sql.val(PERMISSIONS.ANALYTICS_INTEGRATION_READ)}
          else value
        end as permission
        from jsonb_array_elements_text(roles.permissions) as permission_values(value)
        where value not in ('analytics.read', 'identity.manage', 'identity.read')
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_PLATFORM_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_MARKET_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_APPLICATION_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_INNOVATION_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_REVIEW_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_DEPARTMENT_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_RISK_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_RUNTIME_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.ANALYTICS_INTEGRATION_READ)}
        where roles.permissions ? 'analytics.read'
        union
        select ${sql.val(PERMISSIONS.IDENTITY_DEPARTMENT_READ)}
        where roles.permissions ? 'identity.manage' or roles.permissions ? 'identity.read'
        union
        select ${sql.val(PERMISSIONS.IDENTITY_EMPLOYEE_READ)}
        where roles.permissions ? 'identity.manage' or roles.permissions ? 'identity.read'
        union
        select ${sql.val(PERMISSIONS.IDENTITY_ROLE_READ)}
        where roles.permissions ? 'identity.manage' or roles.permissions ? 'identity.read'
        union
        select ${sql.val(PERMISSIONS.IDENTITY_SESSION_MANAGE)}
        where roles.permissions ? 'identity.manage'
      ) normalized_permissions
    )
    where permissions ?| array[
      'marketplace.read',
      'identity.manage',
      'identity.read',
      'analytics.read',
      'analytics:platform:read',
      'analytics:market:read',
      'analytics:application:read',
      'analytics:innovation:read',
      'analytics:review:read',
      'analytics:department:read',
      'analytics:risk:read',
      'analytics:runtime:read',
      'analytics:integration:read'
    ]
  `.execute(db);

  await sql`
    update analytics_metric_definitions
    set required_permission = replace(required_permission, ':', '.')
    where required_permission like 'analytics:%'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const registryRoleCodes = sql.join(
    roleCodes.map((roleCode) => sql.val(roleCode)),
  );
  await sql`
    delete from employee_roles where role_code in (${registryRoleCodes})
  `.execute(db);
  await sql`
    insert into employee_roles (employee_id, role_code)
    select employee_id, role_code
    from jsonb_to_recordset((select employee_roles from authorization_0013_snapshot where snapshot_id = true))
      as snapshot(employee_id varchar(64), role_code varchar(64))
    on conflict (employee_id, role_code) do nothing
  `.execute(db);
  await sql`
    delete from roles where role_code in (${registryRoleCodes})
  `.execute(db);
  await sql`
    insert into roles (role_code, name, permissions, is_system)
    select role_code, name, permissions, is_system
    from jsonb_to_recordset((select roles from authorization_0013_snapshot where snapshot_id = true))
      as snapshot(role_code varchar(64), name varchar(120), permissions jsonb, is_system boolean)
    on conflict (role_code) do update
      set name = excluded.name, permissions = excluded.permissions, is_system = excluded.is_system
  `.execute(db);
  await sql`
    update analytics_metric_definitions target
    set required_permission = snapshot.required_permission
    from jsonb_to_recordset((select metrics from authorization_0013_snapshot where snapshot_id = true))
      as snapshot(metric_key varchar(128), version integer, required_permission varchar(120))
    where target.metric_key = snapshot.metric_key and target.version = snapshot.version
  `.execute(db);
  await sql`drop table authorization_0013_snapshot`.execute(db);
}
