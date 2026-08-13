import { sql, type Kysely } from "kysely";

/** 统一员工主部门事实源，并补齐组织与 DingTalk SSO 的关键完整性约束。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    update employees
    set employee_number = upper(trim(employee_id))
    where employee_number is null or trim(employee_number) = ''
  `.execute(db);

  // 旧版本曾生成无法完成、且未携带身份的 handoff；升级时使其失效，避免错误身份继续流转。
  await sql`
    update dingtalk_sso_transactions
    set handoff_token_hash = null
    where handoff_token_hash is not null
      and (dingtalk_user_id is null or employee_id is null)
  `.execute(db);

  await sql`
    update department_memberships membership
       set is_primary = (
         membership.department_id = employee.primary_department_id
       )
      from employees employee
     where employee.employee_id = membership.employee_id
  `.execute(db);

  await sql`
    insert into department_memberships (employee_id, department_id, is_primary)
    select employee_id, primary_department_id, true
      from employees
    on conflict (employee_id, department_id)
    do update set is_primary = excluded.is_primary
  `.execute(db);

  await sql`
    create unique index if not exists department_memberships_one_primary_per_employee
      on department_memberships(employee_id)
      where is_primary = true
  `.execute(db);

  await sql`
    alter table departments
      add constraint departments_parent_department_fk
      foreign key (parent_department_id)
      references departments(department_id)
      on delete restrict
      not valid
  `.execute(db);
  await sql`
    alter table departments
      validate constraint departments_parent_department_fk
  `.execute(db);

  await sql`
    alter table departments
      add constraint departments_manager_employee_fk
      foreign key (manager_employee_id)
      references employees(employee_id)
      on delete set null
      not valid
  `.execute(db);
  await sql`
    alter table departments
      validate constraint departments_manager_employee_fk
  `.execute(db);

  await sql`
    create unique index if not exists departments_source_external_id_unique
      on departments(source, external_id)
      where external_id is not null
  `.execute(db);

  await sql`
    alter table dingtalk_sso_transactions
      add constraint dingtalk_sso_handoff_identity_check
      check (
        handoff_token_hash is null
        or (dingtalk_user_id is not null and employee_id is not null)
      )
      not valid
  `.execute(db);
  await sql`
    alter table dingtalk_sso_transactions
      validate constraint dingtalk_sso_handoff_identity_check
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table dingtalk_sso_transactions
      drop constraint if exists dingtalk_sso_handoff_identity_check
  `.execute(db);
  await sql`drop index if exists departments_source_external_id_unique`.execute(
    db,
  );
  await sql`
    alter table departments
      drop constraint if exists departments_manager_employee_fk
  `.execute(db);
  await sql`
    alter table departments
      drop constraint if exists departments_parent_department_fk
  `.execute(db);
  await sql`
    drop index if exists department_memberships_one_primary_per_employee
  `.execute(db);
}
