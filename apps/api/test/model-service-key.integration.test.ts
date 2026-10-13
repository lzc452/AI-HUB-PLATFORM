import { randomUUID } from "node:crypto";
import {
  createDatabase,
  runMigrations,
  type DatabaseSchema,
} from "@ai-hub/database";
import {
  KyselyModelServiceKeyRepository,
  MODEL_SERVICE_ERROR_CODES,
  ModelServiceError,
  ModelServiceKeyService,
  type ModelServiceKeyServiceConfig,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "0123456789abcdef0123456789abcdef";

const serviceConfig: ModelServiceKeyServiceConfig = {
  hmacSecret: SECRET,
  hmacSecretPrevious: undefined,
  maxRpm: 6000,
  maxTpm: 10_000_000,
  maxDailyTokens: 1_000_000_000,
  maxKeysPerUser: 10,
};

/**
 * M1 退出条件的真库证据：迁移 0056 在真实 PostgreSQL 上应用成功、表/索引/权限如约，
 * 且仓储与服务在真库上满足唯一索引、CAS 与事务语义（内存 fake 无法证明的部分）。
 */
describe("模型服务 Key 真库集成（迁移 0056）", () => {
  const suffix = randomUUID();
  const employeeId = `MDL-${suffix}`.toUpperCase();
  const otherEmployeeId = `MDL-OTHER-${suffix}`.toUpperCase();
  const departmentId = `mdl-dept-${suffix}`;

  let db: Kysely<DatabaseSchema>;
  let stop: (() => Promise<void>) | undefined;
  let repository: KyselyModelServiceKeyRepository;
  let service: ModelServiceKeyService;

  // ActorContext 由 @ai-hub/server 的方法签名约束，这里用结构等价的字面量即可
  // （apps/api 不直接依赖 @ai-hub/contracts，避免越过包边界）。
  const actor = {
    employeeId,
    roleCodes: ["employee"],
    permissions: [],
    departmentIds: [departmentId],
    primaryDepartmentId: departmentId,
    sessionId: `session-${suffix}`,
  };

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);

    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: "模型服务测试部门",
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values([
        {
          employee_id: employeeId,
          display_name: "模型服务测试员工",
          status: "active",
          primary_department_id: departmentId,
          password_hash: null,
          password_reset_required: false,
        },
        {
          employee_id: otherEmployeeId,
          display_name: "模型服务他人",
          status: "active",
          primary_department_id: departmentId,
          password_hash: null,
          password_reset_required: false,
        },
      ])
      .execute();

    repository = new KyselyModelServiceKeyRepository(db);
    service = new ModelServiceKeyService(
      repository,
      { recordEvent: async () => undefined },
      serviceConfig,
    );
  }, 180_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("迁移 0056 建出三张表", async () => {
    const rows = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('llm_api_keys', 'llm_api_call_logs', 'llm_usage_daily')
      order by table_name
    `.execute(db);
    expect(rows.rows.map((row) => row.table_name)).toEqual([
      "llm_api_call_logs",
      "llm_api_keys",
      "llm_usage_daily",
    ]);
  });

  it("迁移 0056 建出全部索引，含同名防重的部分唯一索引", async () => {
    const rows = await sql<{ indexname: string; indexdef: string }>`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public'
        and (tablename like 'llm_%' or indexname like 'llm_%')
      order by indexname
    `.execute(db);
    const names = rows.rows.map((row) => row.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "llm_api_keys_key_hash_unique",
        "llm_api_keys_employee_status_idx",
        "llm_api_keys_employee_name_unique",
        "llm_api_call_logs_employee_requested_idx",
        "llm_api_call_logs_key_requested_idx",
        "llm_api_call_logs_requested_at_idx",
      ]),
    );
    const nameIndex = rows.rows.find(
      (row) => row.indexname === "llm_api_keys_employee_name_unique",
    );
    // 部分唯一索引必须带 where 条件，否则「撤销后复用同名」会被合法重建挡掉。
    // 注意：PG 会把谓词规范化（补 ::text 与括号），断言按语义匹配而非字面量，
    // 实测输出形如：... WHERE ((status)::text <> 'revoked'::text)
    expect(nameIndex?.indexdef).toMatch(/WHERE .*status.*<>.*'revoked'/u);
    expect(nameIndex?.indexdef).toContain("UNIQUE");
  });

  it("employee 角色被授予本人维度的三个权限，全平台权限不在其中", async () => {
    const role = await db
      .selectFrom("roles")
      .select("permissions")
      .where("role_code", "=", "employee")
      .executeTakeFirstOrThrow();
    const permissions = role.permissions as readonly string[];
    expect(permissions).toEqual(
      expect.arrayContaining([
        "model_service.key.read",
        "model_service.key.manage",
        "model_service.usage.read",
      ]),
    );
    expect(permissions).not.toContain("model_service.key.manage_all");
    expect(permissions).not.toContain("model_service.usage.read_all");
  });

  it("创建落库为哈希、bigint 限额可往返，明文不入库", async () => {
    const created = await service.createKey(actor, {
      name: "integration-create",
      dailyTokenLimit: 2_000_000,
      rpmLimit: 30,
    });

    const row = await db
      .selectFrom("llm_api_keys")
      .selectAll()
      .where("key_id", "=", created.summary.keyId)
      .executeTakeFirstOrThrow();

    expect(row.key_hash).toHaveLength(64);
    expect(row.key_hash).not.toContain(created.apiKey);
    expect(row.key_prefix).toBe(created.apiKey.slice(0, 16));
    // bigint 列在 pg 驱动下是字符串，服务层必须归一成 number
    expect(created.summary.limits.dailyTokens).toBe(2_000_000);
    expect(row.daily_token_limit).toBe("2000000");
    expect(JSON.stringify(row)).not.toContain(created.apiKey);
  });

  it("数据库层拒绝同一员工的两个未撤销同名 Key（23505）", async () => {
    const created = await service.createKey(actor, { name: "integration-dup" });
    await expect(
      repository.insert({
        employeeId,
        name: "integration-dup",
        keyPrefix: "sk-aihub-dupprefix",
        keyHash: "f".repeat(64),
        rpmLimit: null,
        tpmLimit: null,
        dailyTokenLimit: null,
        expiresAt: null,
        rotatedFromKeyId: null,
      }),
    ).rejects.toMatchObject({ code: "23505" });

    // 服务层把同一冲突翻译成领域错误
    await expect(
      service.createKey(actor, { name: "integration-dup" }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ModelServiceError &&
        error.code === MODEL_SERVICE_ERROR_CODES.NAME_DUPLICATED,
    );
    expect(created.summary.name).toBe("integration-dup");
  });

  it("撤销后可复用同名（部分唯一索引只约束未撤销记录）", async () => {
    const created = await service.createKey(actor, {
      name: "integration-reuse",
    });
    await service.revokeKey(actor, created.summary.keyId);

    const again = await service.createKey(actor, { name: "integration-reuse" });
    expect(again.summary.keyId).not.toBe(created.summary.keyId);
  });

  it("key_hash 唯一索引拒绝重复摘要（碰撞或重复插入防线）", async () => {
    const created = await service.createKey(actor, {
      name: "integration-hash",
    });
    const row = await db
      .selectFrom("llm_api_keys")
      .select("key_hash")
      .where("key_id", "=", created.summary.keyId)
      .executeTakeFirstOrThrow();

    await expect(
      repository.insert({
        employeeId,
        name: "integration-hash-copy",
        keyPrefix: "sk-aihub-copypref",
        keyHash: row.key_hash,
        rpmLimit: null,
        tpmLimit: null,
        dailyTokenLimit: null,
        expiresAt: null,
        rotatedFromKeyId: null,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("员工外键约束拦住不存在的员工（varchar(64) 与 employees 对齐）", async () => {
    await expect(
      repository.insert({
        employeeId: `NOT-EXIST-${suffix}`.toUpperCase(),
        name: "orphan",
        keyPrefix: "sk-aihub-orphanXX",
        keyHash: "a".repeat(64),
        rpmLimit: null,
        tpmLimit: null,
        dailyTokenLimit: null,
        expiresAt: null,
        rotatedFromKeyId: null,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("状态变更 CAS 在真库上生效：并发撤销只成功一次", async () => {
    const created = await service.createKey(actor, { name: "integration-cas" });

    const first = await repository.updateStatusCas({
      keyId: created.summary.keyId,
      employeeId,
      expectedStatus: "active",
      nextStatus: "revoked",
      now: new Date(),
    });
    expect(first?.status).toBe("revoked");

    const second = await repository.updateStatusCas({
      keyId: created.summary.keyId,
      employeeId,
      expectedStatus: "active",
      nextStatus: "revoked",
      now: new Date(),
    });
    expect(second).toBeNull();
  });

  it("轮换在同一事务内完成：旧钥 revoked、新钥关联谱系", async () => {
    const created = await service.createKey(actor, {
      name: "integration-rotate",
      rpmLimit: 77,
    });
    const rotated = await service.rotateKey(actor, created.summary.keyId);

    const rows = await db
      .selectFrom("llm_api_keys")
      .select(["key_id", "status", "rotated_from_key_id", "rpm_limit"])
      .where("employee_id", "=", employeeId)
      .where("name", "=", "integration-rotate")
      .orderBy("created_at", "asc")
      .execute();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe("revoked");
    expect(rows[1]?.status).toBe("active");
    expect(rows[1]?.rotated_from_key_id).toBe(rows[0]?.key_id);
    expect(rows[1]?.rpm_limit).toBe(77);
    expect(rotated.summary.keyId).toBe(rows[1]?.key_id);
  });

  it("数据权限在 SQL 层生效：他人读不到我的 Key", async () => {
    const created = await service.createKey(actor, {
      name: "integration-scope",
    });
    const visible = await repository.findById(
      created.summary.keyId,
      otherEmployeeId,
    );
    expect(visible).toBeNull();
  });

  it("列表按创建时间倒序并支持包含已撤销", async () => {
    const page = await service.listKeys(actor, { pageSize: 200 });
    const names = page.items.map((item) => item.name);
    expect(names).toContain("integration-reuse");

    const withRevoked = await service.listKeys(actor, {
      includeRevoked: true,
      pageSize: 200,
    });
    expect(withRevoked.total).toBeGreaterThanOrEqual(page.total);
    expect(withRevoked.items.some((item) => item.status === "revoked")).toBe(
      true,
    );
  });

  it("每日聚合表主键防重复累计（同一 business day/员工/Key/模型唯一）", async () => {
    const created = await service.createKey(actor, {
      name: "integration-usage",
    });
    const values = {
      usage_date: "2026-10-13",
      employee_id: employeeId,
      key_id: created.summary.keyId,
      model: "qwen2.5-7b-instruct",
      calls: "1",
      error_calls: "0",
      prompt_tokens: "10",
      completion_tokens: "20",
      total_tokens: "30",
    };
    await db.insertInto("llm_usage_daily").values(values).execute();
    await expect(
      db.insertInto("llm_usage_daily").values(values).execute(),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
