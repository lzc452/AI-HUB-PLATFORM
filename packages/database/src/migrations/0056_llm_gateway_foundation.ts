import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../schema.js";
import { SYSTEM_ROLE_DEFINITIONS } from "../authorization/system-roles.js";

/**
 * 0056：模型服务网关基础（API Key / 调用记录 / 每日用量聚合）+ employee 权限对齐。
 *
 * 设计依据：`docs/requirements/api-platform-key-management.md` v1.4（定稿）第 9 章。
 *
 * ## 为什么这三张表长成这个样子
 *
 * **A. 只存哈希，不存明文。** `key_hash` 是 HMAC-SHA256 十六进制摘要，查找路径是
 * 唯一索引点查；`key_prefix` 仅供界面辨识。明文只在创建/轮换的响应体里出现一次。
 *
 * **B. 员工外键用 varchar(64)。** `employees.employee_id` 是 varchar(64)（见 0002），
 * 不是 uuid——写成 uuid 会直接建不出外键。新表自身的主键才用 uuid + gen_random_uuid()。
 *
 * **C. `employee_id + name` 用「部分唯一索引」而不是普通唯一索引。** 撤销（revoked）后
 * 用户会想复用同名，普通唯一索引会把这类合法重建挡掉；`where status <> 'revoked'` 只约束
 * 未撤销记录。该约束同时兜住「前端重复提交 / 并发创建同名」——check-then-insert 在并发下
 * 必有 TOCTOU 窗口，数据库约束才是真防线（0055 的同类教训）。
 *
 * **D. 调用记录与聚合表分家。** `llm_api_call_logs` 是事实来源（每次调用一行，含被拒绝的
 * 调用），`llm_usage_daily` 是 worker 汇聚出来的读模型：鉴权与配额判定读事实表（口径唯一、
 * 可对账），看板读聚合表（避免每次请求扫全表）。`usage_estimated` 显式标记「上游没返回
 * usage、token 由本地估算」的行，否则看板数字真假难辨。
 *
 * **E. 幂等 DDL。** 全部 `if not exists`，与 0055 一致：同一份迁移在不同库状态下都会被
 * 重复触碰，幂等是唯一让重复应用无害的手段。
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  // ---- A. API Key -------------------------------------------------------
  await sql`
    create table if not exists llm_api_keys (
      key_id uuid primary key default gen_random_uuid(),
      employee_id varchar(64) not null references employees(employee_id),
      name varchar(64) not null,
      key_prefix varchar(24) not null,
      key_hash varchar(64) not null,
      status varchar(16) not null default 'active'
        check (status in ('active', 'disabled', 'revoked')),
      rpm_limit integer check (rpm_limit is null or rpm_limit > 0),
      tpm_limit integer check (tpm_limit is null or tpm_limit > 0),
      daily_token_limit bigint check (daily_token_limit is null or daily_token_limit > 0),
      expires_at timestamptz,
      last_used_at timestamptz,
      rotated_from_key_id uuid references llm_api_keys(key_id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      disabled_at timestamptz
    )
  `.execute(db);

  // 鉴权主路径：按哈希点查（唯一索引本身就是查找索引）。
  await sql`
    create unique index if not exists llm_api_keys_key_hash_unique
    on llm_api_keys (key_hash)
  `.execute(db);

  // 列表：本人 + 状态 + 创建时间倒序（``includeRevoked`` 的两种查询形状都覆盖）。
  await sql`
    create index if not exists llm_api_keys_employee_status_idx
    on llm_api_keys (employee_id, status, created_at desc)
  `.execute(db);

  // 同名防重（仅约束未撤销记录，见上方 C）。
  await sql`
    create unique index if not exists llm_api_keys_employee_name_unique
    on llm_api_keys (employee_id, name)
    where status <> 'revoked'
  `.execute(db);

  // ---- B. 调用记录 ------------------------------------------------------
  await sql`
    create table if not exists llm_api_call_logs (
      call_id uuid primary key default gen_random_uuid(),
      key_id uuid not null references llm_api_keys(key_id),
      employee_id varchar(64) not null,
      endpoint varchar(32) not null,
      model varchar(64) not null,
      stream boolean not null default false,
      prompt_tokens integer not null default 0,
      completion_tokens integer not null default 0,
      total_tokens integer not null default 0,
      duration_ms integer not null,
      status_code integer not null,
      error_code varchar(32),
      usage_estimated boolean not null default false,
      trace_id varchar(64),
      requested_at timestamptz not null
    )
  `.execute(db);

  // 日配额判定与本人明细共用该形状（`employee_id = ? and requested_at >= ?`）。
  await sql`
    create index if not exists llm_api_call_logs_employee_requested_idx
    on llm_api_call_logs (employee_id, requested_at desc)
  `.execute(db);

  await sql`
    create index if not exists llm_api_call_logs_key_requested_idx
    on llm_api_call_logs (key_id, requested_at desc)
  `.execute(db);

  // 保留策略清理（180 天）与全平台时间范围查询。
  await sql`
    create index if not exists llm_api_call_logs_requested_at_idx
    on llm_api_call_logs (requested_at)
  `.execute(db);

  // ---- C. 每日用量聚合 --------------------------------------------------
  // 不设外键：聚合行需要比单个 Key 的生命周期更久（Key 撤销后历史用量仍要能读）。
  await sql`
    create table if not exists llm_usage_daily (
      usage_date date not null,
      employee_id varchar(64) not null,
      key_id uuid not null,
      model varchar(64) not null,
      calls bigint not null default 0,
      error_calls bigint not null default 0,
      prompt_tokens bigint not null default 0,
      completion_tokens bigint not null default 0,
      total_tokens bigint not null default 0,
      primary key (usage_date, employee_id, key_id, model)
    )
  `.execute(db);

  // ---- D. employee 角色权限对齐 -----------------------------------------
  // 与 0037/0038/0044/0048 相同：把 employee 角色的权限与 SYSTEM_ROLE_DEFINITIONS 对齐
  // （纯数据更新）。本人维度的三个 model_service 权限默认授予普通员工——自助开通是
  // REQ-MDL-01 的产品前提，否则员工在控制面会直接 403、前端入口也会因权限隐藏。
  // 全平台维度（manage_all / read_all / config.manage）不授予 employee，仅超管的 "*" 覆盖。
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

/** 回退：先摘权限（不影响既有会话，仅收回 model_service.*），再按外键顺序删表。 */
export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    update roles
    set permissions = (
      select coalesce(
        jsonb_agg(to_jsonb(permission) order by permission),
        '[]'::jsonb
      )
      from jsonb_array_elements_text(roles.permissions)
        as permission_values(permission)
      where permission not in (
        'model_service.key.read',
        'model_service.key.manage',
        'model_service.usage.read'
      )
    )
    where role_code = 'employee'
      and permissions ?| array[
        'model_service.key.read',
        'model_service.key.manage',
        'model_service.usage.read'
      ]
  `.execute(db);

  await sql`drop table if exists llm_usage_daily`.execute(db);
  await sql`drop table if exists llm_api_call_logs`.execute(db);
  await sql`drop table if exists llm_api_keys`.execute(db);
}
