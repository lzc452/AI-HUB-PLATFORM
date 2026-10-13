import { randomUUID } from "node:crypto";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { KyselyApplicationRepository } from "@ai-hub/server";
import type { DeliveryChannel } from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 管理端应用列表的分页门禁（真实 PostgreSQL）。
 *
 * 这次改造把「捞全表 + 应用层 filter + slice」改成了
 * 「channel 过滤下推 EXISTS + limit/offset 下推 SQL」。
 * 单元测试完全看不见这类改动 —— 服务层替身不执行 SQL，
 * 集成测试此前也没有任何一个用例调用管理端列表（都是内存 application 替身）。
 * 没有这个文件，`EXISTS` 写错、count 与分页不同源、排序缺收尾都不会被发现。
 */
describe("管理端应用列表：分页与channel 过滤下推", () => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const departmentId = `DEPT-PAGE-${suffix}`;
  const ownerId = `E-OWNER-${suffix}`;
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let repository: KyselyApplicationRepository;

  // 用 "*" 通配权限模拟管理员：listAdmin 用它决定是否可见全部应用。
  const admin = {
    employeeId: ownerId,
    displayName: "分页管理员",
    roleCodes: ["super_admin"],
    permissions: ["*"],
    sessionId: `session-${suffix}`,
    departmentIds: [departmentId],
    primaryDepartmentId: departmentId,
  } as const;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    repository = new KyselyApplicationRepository(db);

    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: `分页部门-${suffix}`,
        parent_department_id: null,
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values([
        {
          employee_id: ownerId,
          display_name: "分页管理员",
          primary_department_id: departmentId,
          password_reset_required: false,
          status: "active",
        },
      ])
      .execute();
  }, 120_000);

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  }, 60_000);

  /** 建应用并按需绑定投放渠道，返回 applicationId。 */
  async function seedApplication(
    name: string,
    channels: readonly DeliveryChannel[],
  ): Promise<string> {
    const created = await repository.createApplication({
      ownerEmployeeId: ownerId,
      maintainerEmployeeId: ownerId,
      departmentId,
      name: `${name}-${suffix}`,
      summary: `${name} 摘要`,
    });
    for (const channel of channels) {
      await repository.createDelivery({
        applicationId: created.applicationId,
        channel,
        entryUrl: `https://example.invalid/${channel}`,
        minClientVersion: null,
        enabled: true,
      });
    }
    return created.applicationId;
  }

  it("total 与分页一致，且跨页不重不漏", async () => {
    const created: string[] = [];
    for (let index = 0; index < 5; index++) {
      created.push(await seedApplication(`分页应用${index}`, []));
    }

    const first = await repository.listAdmin(admin, { page: 1, pageSize: 2 });
    expect(first.total).toBeGreaterThanOrEqual(5);
    expect(first.items).toHaveLength(2);

    // 逐页取全量，验证不重不漏——这正是缺收尾排序时的典型故障。
    const collected: string[] = [];
    const totalPages = Math.ceil(first.total / 2);
    for (let page = 1; page <= totalPages; page++) {
      const result = await repository.listAdmin(admin, { page, pageSize: 2 });
      collected.push(...result.items.map((item) => item.applicationId));
    }
    expect(new Set(collected).size).toBe(collected.length);
    for (const applicationId of created) {
      expect(collected).toContain(applicationId);
    }
  }, 60_000);

  it("channel 过滤在分页之前生效：total 与条数都只含该渠道", async () => {
    const withWeb = await seedApplication("有网页渠道", ["web"]);
    const desktopOnly = await seedApplication("只有桌面渠道", ["desktop"]);

    const result = await repository.listAdmin(admin, {
      page: 1,
      pageSize: 50,
      channel: "web",
    });

    const ids = result.items.map((item) => item.applicationId);
    expect(ids).toContain(withWeb);
    // 关键断言：被过滤掉的应用不能出现在结果里。
    expect(ids).not.toContain(desktopOnly);
    // total 必须是「过滤后」的总数。若仍是过滤前的全量，
    // UI 分页器会多出若干空页——这是应用层过滤改下推最容易漏掉的语义。
    expect(result.total).toBe(ids.length);
    expect(
      result.items.every((item) => item.deliveryChannels.includes("web")),
    ).toBe(true);
  }, 60_000);
});
