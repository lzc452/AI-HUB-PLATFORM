import { randomUUID } from "node:crypto";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { KyselyIdentityRepository } from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 回归测试：角色权限写入 jsonb 列。
 *
 * 此前createRole / updateRole / copyRole 三处都把 `string[]` 直接交给
 * Kysely写 jsonb 列，pg 驱动按 PostgreSQL 数组字面量序列化成 `{"a","b"}`，
 * 而 jsonb 只接受 JSON，PG 报 `invalid input syntax for type json`。
 * 该错误经 controller 的 rethrow 归一后只回 `BAD_REQUEST`，
 * 导致「创建角色 / 权限变更 / 角色复制」三条接口在真实 DB 上 100% 失败，
 * 而内存替身的单测全部通过——这类缺陷只有打真实 PG 才能发现。
 */
describe("角色权限 jsonb 写入（真实数据库）", () => {
  const suffix = randomUUID();
  const creatorEmployeeId = `P0-JB-${suffix.toUpperCase()}`;
  const departmentId = `jsonb-dept-${suffix}`;
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let repository: KyselyIdentityRepository;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: "角色权限写入测试部门",
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values({
        employee_id: creatorEmployeeId,
        employee_number: creatorEmployeeId,
        display_name: "角色权限写入测试",
        status: "active",
        primary_department_id: departmentId,
        password_reset_required: false,
      })
      .execute();
    repository = new KyselyIdentityRepository(db);
  });

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  });

  it("createRole 把字符串数组写成合法 JSON 数组", async () => {
    const roleCode = `jsonb-create-${suffix}`;
    await repository.createRole!({
      roleCode,
      name: "创建角色",
      permissions: ["identity.employee.read", "identity.department.read"],
      createdByEmployeeId: creatorEmployeeId as never,
    });

    const row = await db
      .selectFrom("roles")
      .select("permissions")
      .where("role_code", "=", roleCode)
      .executeTakeFirstOrThrow();
    expect([...row.permissions].sort()).toEqual([
      "identity.department.read",
      "identity.employee.read",
    ]);
  });

  it("updateRole 覆盖权限并可写入空数组", async () => {
    const roleCode = `jsonb-update-${suffix}`;
    await repository.createRole!({
      roleCode,
      name: "更新角色",
      permissions: ["identity.employee.read"],
      createdByEmployeeId: creatorEmployeeId as never,
    });

    await repository.updateRole!(roleCode, {
      permissions: ["identity.employee.read", "identity.role.manage"],
    });
    const after = await db
      .selectFrom("roles")
      .select("permissions")
      .where("role_code", "=", roleCode)
      .executeTakeFirstOrThrow();
    expect([...after.permissions].sort()).toEqual([
      "identity.employee.read",
      "identity.role.manage",
    ]);

    // 空数组是合法的边界：清空权限不应触发 jsonb 解析错误
    await repository.updateRole!(roleCode, { permissions: [] });
    const cleared = await db
      .selectFrom("roles")
      .select("permissions")
      .where("role_code", "=", roleCode)
      .executeTakeFirstOrThrow();
    expect([...cleared.permissions]).toEqual([]);
  });

  it("copyRole 复制权限且不受含空格/中文的名称影响", async () => {
    const sourceCode = `jsonb-copy-src-${suffix}`;
    const targetCode = `jsonb-copy-dst-${suffix}`;
    await repository.createRole!({
      roleCode: sourceCode,
      name: "源角色",
      permissions: ["identity.employee.read"],
      createdByEmployeeId: creatorEmployeeId as never,
    });

    await repository.copyRole!({
      roleCode: targetCode,
      name: "复制角色 中文 & 符号",
      permissions: ["identity.employee.read", "identity.employee.write"],
      createdByEmployeeId: creatorEmployeeId,
    });

    const row = await db
      .selectFrom("roles")
      .select(["permissions", "name"])
      .where("role_code", "=", targetCode)
      .executeTakeFirstOrThrow();
    expect([...row.permissions].sort()).toEqual([
      "identity.employee.read",
      "identity.employee.write",
    ]);
    expect(row.name).toBe("复制角色 中文 & 符号");
  });

  it("updateRole 只改 name 时不触碰 permissions", async () => {
    const roleCode = `jsonb-name-only-${suffix}`;
    await repository.createRole!({
      roleCode,
      name: "原名称",
      permissions: ["identity.employee.read"],
      createdByEmployeeId: creatorEmployeeId as never,
    });

    await repository.updateRole!(roleCode, { name: "新名称" });
    const row = await db
      .selectFrom("roles")
      .select(["permissions", "name"])
      .where("role_code", "=", roleCode)
      .executeTakeFirstOrThrow();
    expect(row.name).toBe("新名称");
    expect([...row.permissions]).toEqual(["identity.employee.read"]);
  });
});
