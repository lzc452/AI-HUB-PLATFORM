import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "./schema.js";
import { SYSTEM_ROLE_DEFINITIONS } from "./authorization/system-roles.js";

export interface DemoDepartmentDefinition {
  departmentId: string;
  name: string;
  parentDepartmentId: string | null;
}

export interface DemoRoleDefinition {
  roleCode: string;
  name: string;
  permissions: readonly string[];
}

export interface DemoAccountDefinition {
  employeeId: string;
  displayName: string;
  primaryDepartmentId: string;
  roleCodes: readonly string[];
}

export interface SeedDemoAccountsResult {
  departments: number;
  roles: number;
  employees: number;
  memberships: number;
  roleAssignments: number;
}

export const DEMO_DEPARTMENT_DEFINITIONS: readonly DemoDepartmentDefinition[] =
  Object.freeze([
    {
      departmentId: "demo-company",
      name: "演示企业",
      parentDepartmentId: null,
    },
    {
      departmentId: "demo-rnd",
      name: "研发中心",
      parentDepartmentId: "demo-company",
    },
    {
      departmentId: "demo-innovation",
      name: "创新运营部",
      parentDepartmentId: "demo-company",
    },
    {
      departmentId: "demo-admin",
      name: "平台管理部",
      parentDepartmentId: "demo-company",
    },
  ]);

export const DEMO_ROLE_DEFINITIONS: readonly DemoRoleDefinition[] =
  SYSTEM_ROLE_DEFINITIONS;

export const DEMO_ACCOUNT_DEFINITIONS: readonly DemoAccountDefinition[] =
  Object.freeze([
    {
      employeeId: "DEMO-EMPLOYEE",
      displayName: "演示普通员工",
      primaryDepartmentId: "demo-rnd",
      roleCodes: ["employee"],
    },
    {
      employeeId: "DEMO-APP-ADMIN",
      displayName: "演示应用管理员",
      primaryDepartmentId: "demo-rnd",
      roleCodes: ["employee", "application_admin"],
    },
    {
      employeeId: "DEMO-INNOVATION",
      displayName: "演示创新运营管理员",
      primaryDepartmentId: "demo-innovation",
      roleCodes: ["employee", "demand_operator"],
    },
    {
      employeeId: "DEMO-ORG-ADMIN",
      displayName: "演示组织管理员",
      primaryDepartmentId: "demo-admin",
      roleCodes: ["employee", "organization_admin"],
    },
    {
      employeeId: "DEMO-SUPER-ADMIN",
      displayName: "演示超级管理员",
      primaryDepartmentId: "demo-admin",
      roleCodes: ["employee", "super_admin"],
    },
  ]);

export async function seedDemoAccounts(
  db: Kysely<DatabaseSchema>,
  passwordHashes: Readonly<Record<string, string>>,
): Promise<SeedDemoAccountsResult> {
  for (const account of DEMO_ACCOUNT_DEFINITIONS) {
    if (passwordHashes[account.employeeId] === undefined) {
      throw new Error(`PASSWORD_HASH_REQUIRED:${account.employeeId}`);
    }
  }

  await db.transaction().execute(async (transaction) => {
    for (const department of DEMO_DEPARTMENT_DEFINITIONS) {
      await transaction
        .insertInto("departments")
        .values({
          department_id: department.departmentId,
          name: department.name,
          parent_department_id: department.parentDepartmentId,
          source: "local",
        })
        .onConflict((oc) =>
          oc.column("department_id").doUpdateSet({
            name: department.name,
            parent_department_id: department.parentDepartmentId,
            source: "local",
            updated_at: new Date(),
          }),
        )
        .execute();
    }

    for (const role of DEMO_ROLE_DEFINITIONS) {
      await transaction
        .insertInto("roles")
        .values({
          role_code: role.roleCode,
          name: role.name,
          permissions: sql<
            readonly string[]
          >`${JSON.stringify(role.permissions)}::jsonb`,
          is_system: true,
        })
        .onConflict((oc) =>
          oc.column("role_code").doUpdateSet({
            name: role.name,
            permissions: sql<
              readonly string[]
            >`${JSON.stringify(role.permissions)}::jsonb`,
            is_system: true,
          }),
        )
        .execute();
    }

    for (const account of DEMO_ACCOUNT_DEFINITIONS) {
      await transaction
        .insertInto("employees")
        .values({
          employee_id: account.employeeId,
          display_name: account.displayName,
          status: "active",
          primary_department_id: account.primaryDepartmentId,
          password_hash: passwordHashes[account.employeeId]!,
          password_reset_required: false,
        })
        .onConflict((oc) =>
          oc.column("employee_id").doUpdateSet({
            display_name: account.displayName,
            status: "active",
            primary_department_id: account.primaryDepartmentId,
            password_hash: passwordHashes[account.employeeId]!,
            password_reset_required: false,
            updated_at: new Date(),
          }),
        )
        .execute();

      await transaction
        .insertInto("department_memberships")
        .values({
          employee_id: account.employeeId,
          department_id: account.primaryDepartmentId,
          is_primary: true,
        })
        .onConflict((oc) =>
          oc.columns(["employee_id", "department_id"]).doUpdateSet({
            is_primary: true,
          }),
        )
        .execute();

      for (const roleCode of account.roleCodes) {
        await transaction
          .insertInto("employee_roles")
          .values({
            employee_id: account.employeeId,
            role_code: roleCode,
          })
          .onConflict((oc) =>
            oc.columns(["employee_id", "role_code"]).doNothing(),
          )
          .execute();
      }
    }
  });

  return {
    departments: DEMO_DEPARTMENT_DEFINITIONS.length,
    roles: DEMO_ROLE_DEFINITIONS.length,
    employees: DEMO_ACCOUNT_DEFINITIONS.length,
    memberships: DEMO_ACCOUNT_DEFINITIONS.length,
    roleAssignments: DEMO_ACCOUNT_DEFINITIONS.reduce(
      (total, account) => total + account.roleCodes.length,
      0,
    ),
  };
}
