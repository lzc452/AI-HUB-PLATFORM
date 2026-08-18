import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { createDatabase, runMigrations } from "./index.js";
import {
  DEMO_ACCOUNT_DEFINITIONS,
  DEMO_ROLE_DEFINITIONS,
  seedDemoAccounts,
} from "./demo-seed.js";

describe("demo account seed", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  const sortedDemoAccounts = [...DEMO_ACCOUNT_DEFINITIONS].sort((left, right) =>
    left.employeeId.localeCompare(right.employeeId),
  );

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("seeds the demo organization, roles, employees, and relationships", async () => {
    const passwordHashes = Object.fromEntries(
      DEMO_ACCOUNT_DEFINITIONS.map(({ employeeId }) => [
        employeeId,
        `hash-for-${employeeId}`,
      ]),
    );

    const result = await seedDemoAccounts(db, passwordHashes);

    expect(result).toEqual({
      departments: 4,
      roles: DEMO_ROLE_DEFINITIONS.length,
      employees: 2,
      memberships: 2,
      roleAssignments: 3,
    });

    const departments = await db
      .selectFrom("departments")
      .select(["department_id", "parent_department_id", "source"])
      .where("department_id", "like", "demo-%")
      .orderBy("department_id")
      .execute();
    expect(departments).toEqual([
      {
        department_id: "demo-admin",
        parent_department_id: "demo-company",
        source: "local",
      },
      {
        department_id: "demo-company",
        parent_department_id: null,
        source: "local",
      },
      {
        department_id: "demo-innovation",
        parent_department_id: "demo-company",
        source: "local",
      },
      {
        department_id: "demo-rnd",
        parent_department_id: "demo-company",
        source: "local",
      },
    ]);

    const employees = await db
      .selectFrom("employees")
      .select([
        "employee_id",
        "status",
        "primary_department_id",
        "password_hash",
        "password_reset_required",
      ])
      .where("employee_id", "like", "DEMO-%")
      .orderBy("employee_id")
      .execute();
    expect(employees).toEqual(
      sortedDemoAccounts.map((account) => ({
        employee_id: account.employeeId,
        status: "active",
        primary_department_id: account.primaryDepartmentId,
        password_hash: passwordHashes[account.employeeId],
        password_reset_required: false,
      })),
    );

    const relationships = await db
      .selectFrom("employee_roles")
      .select(["employee_id", "role_code"])
      .where("employee_id", "like", "DEMO-%")
      .orderBy("employee_id")
      .orderBy("role_code")
      .execute();
    expect(relationships).toEqual(
      sortedDemoAccounts
        .flatMap((account) =>
          account.roleCodes.map((roleCode) => ({
            employee_id: account.employeeId,
            role_code: roleCode,
          })),
        )
        .sort(
          (left, right) =>
            left.employee_id.localeCompare(right.employee_id) ||
            left.role_code.localeCompare(right.role_code),
        ),
    );
  });

  it("updates demo rows without duplicating them when seeded again", async () => {
    await db
      .updateTable("employees")
      .set({
        status: "disabled",
        password_hash: "old-hash",
      })
      .where("employee_id", "=", "DEMO-EMPLOYEE")
      .execute();

    const passwordHashes = Object.fromEntries(
      DEMO_ACCOUNT_DEFINITIONS.map(({ employeeId }) => [
        employeeId,
        `new-hash-for-${employeeId}`,
      ]),
    );

    await seedDemoAccounts(db, passwordHashes);

    const employee = await db
      .selectFrom("employees")
      .select(["status", "password_hash"])
      .where("employee_id", "=", "DEMO-EMPLOYEE")
      .executeTakeFirstOrThrow();
    expect(employee).toEqual({
      status: "active",
      password_hash: "new-hash-for-DEMO-EMPLOYEE",
    });

    const memberships = await db
      .selectFrom("department_memberships")
      .select("employee_id")
      .where("employee_id", "=", "DEMO-EMPLOYEE")
      .execute();
    const roleAssignments = await db
      .selectFrom("employee_roles")
      .select("employee_id")
      .where("employee_id", "=", "DEMO-EMPLOYEE")
      .execute();
    expect(memberships).toHaveLength(1);
    expect(roleAssignments).toHaveLength(1);
  });
});
