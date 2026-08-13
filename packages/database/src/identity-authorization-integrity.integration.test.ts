import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { createDatabase, runMigrations } from "./index.js";

describe("identity authorization integrity", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("为员工生成标准 employee_number 并仅允许一个主部门", async () => {
    await db
      .insertInto("departments")
      .values([
        {
          department_id: "identity-integrity-a",
          name: "部门 A",
          source: "local",
        },
        {
          department_id: "identity-integrity-b",
          name: "部门 B",
          source: "local",
        },
      ])
      .execute();
    await db
      .insertInto("employees")
      .values({
        employee_id: "identity-integrity-employee",
        employee_number: "E-INTEGRITY",
        display_name: "完整性测试员工",
        status: "active",
        primary_department_id: "identity-integrity-a",
        password_hash: null,
        password_reset_required: false,
      })
      .execute();
    await db
      .insertInto("department_memberships")
      .values({
        employee_id: "identity-integrity-employee",
        department_id: "identity-integrity-a",
        is_primary: true,
      })
      .execute();

    await expect(
      db
        .insertInto("department_memberships")
        .values({
          employee_id: "identity-integrity-employee",
          department_id: "identity-integrity-b",
          is_primary: true,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("拒绝缺失 employeeId 或 dingtalkUserId 的 handoff", async () => {
    await expect(
      sql`
        insert into dingtalk_sso_transactions (
          state_hash,
          browser_context_binding_hash,
          handoff_token_hash,
          return_to,
          expires_at
        ) values (
          repeat('a', 64),
          repeat('b', 64),
          repeat('c', 64),
          '/marketplace',
          now() + interval '2 minutes'
        )
      `.execute(db),
    ).rejects.toThrow();
  });
});
