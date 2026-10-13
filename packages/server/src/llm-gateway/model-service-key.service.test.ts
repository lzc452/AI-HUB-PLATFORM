import type { ActorContext } from "@ai-hub/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ModelServiceKeyService,
  type ModelServiceAuditPort,
  type ModelServiceKeyServiceConfig,
} from "./model-service-key.service.js";
import type {
  InsertApiKeyInput,
  ListApiKeysInput,
  ModelServiceKeyRepository,
  RotateApiKeyInput,
  UpdateApiKeyAttributesInput,
  UpdateApiKeyStatusInput,
} from "./model-service-key.repository.js";
import {
  MODEL_SERVICE_ERROR_CODES,
  ModelServiceError,
  type ApiKeyRecord,
} from "./llm-gateway.types.js";

const SECRET = "0123456789abcdef0123456789abcdef";

const actor: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  permissions: [],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-1",
};

const otherActor: ActorContext = { ...actor, employeeId: "E200" };

const START = new Date("2026-10-13T09:00:00.000Z");

/**
 * 内存仓储：忠实复刻迁移 0056 的两条数据库语义——
 * 部分唯一索引（未撤销 Key 同名冲突抛 23505）与 CAS 未命中返回 null。
 */
class FakeRepository implements ModelServiceKeyRepository {
  public readonly keys: ApiKeyRecord[] = [];
  public failNextInsertWithUniqueViolation = false;
  private sequence = 0;

  public async insert(input: InsertApiKeyInput): Promise<ApiKeyRecord> {
    if (this.failNextInsertWithUniqueViolation) {
      this.failNextInsertWithUniqueViolation = false;
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    }
    if (
      this.keys.some(
        (key) =>
          key.employeeId === input.employeeId &&
          key.name === input.name &&
          key.status !== "revoked",
      )
    ) {
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    }
    this.sequence += 1;
    const record: ApiKeyRecord = {
      keyId: `key-${this.sequence}`,
      employeeId: input.employeeId,
      name: input.name,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      status: "active",
      limits: {
        rpm: input.rpmLimit,
        tpm: input.tpmLimit,
        dailyTokens: input.dailyTokenLimit,
      },
      expiresAt: input.expiresAt,
      lastUsedAt: null,
      rotatedFromKeyId: input.rotatedFromKeyId,
      createdAt: new Date(START),
      updatedAt: new Date(START),
      disabledAt: null,
    };
    this.keys.push(record);
    return { ...record };
  }

  public async findById(
    keyId: string,
    employeeId: string,
  ): Promise<ApiKeyRecord | null> {
    const found = this.keys.find(
      (key) => key.keyId === keyId && key.employeeId === employeeId,
    );
    return found === undefined ? null : { ...found };
  }

  public async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const found = this.keys.find((key) => key.keyHash === keyHash);
    return found === undefined ? null : { ...found };
  }

  public async findHoldingByName(
    employeeId: string,
    name: string,
  ): Promise<ApiKeyRecord | null> {
    const found = this.keys.find(
      (key) =>
        key.employeeId === employeeId &&
        key.name === name &&
        key.status !== "revoked",
    );
    return found === undefined ? null : { ...found };
  }

  public async countHoldingKeys(employeeId: string): Promise<number> {
    return this.keys.filter(
      (key) =>
        key.employeeId === employeeId &&
        (key.status === "active" || key.status === "disabled"),
    ).length;
  }

  public async listByEmployee(
    input: ListApiKeysInput,
  ): Promise<{ items: ApiKeyRecord[]; total: number }> {
    const matched = this.keys
      .filter(
        (key) =>
          key.employeeId === input.employeeId &&
          (input.includeRevoked || key.status !== "revoked"),
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
    return {
      items: matched
        .slice(input.offset, input.offset + input.limit)
        .map((key) => ({ ...key })),
      total: matched.length,
    };
  }

  public async updateAttributes(
    input: UpdateApiKeyAttributesInput,
  ): Promise<ApiKeyRecord | null> {
    const found = this.keys.find(
      (key) =>
        key.keyId === input.keyId &&
        key.employeeId === input.employeeId &&
        key.status !== "revoked",
    );
    if (found === undefined) return null;
    if (input.name !== undefined) found.name = input.name;
    if (input.rpmLimit !== undefined) found.limits.rpm = input.rpmLimit;
    if (input.tpmLimit !== undefined) found.limits.tpm = input.tpmLimit;
    if (input.dailyTokenLimit !== undefined) {
      found.limits.dailyTokens = input.dailyTokenLimit;
    }
    if (input.expiresAt !== undefined) found.expiresAt = input.expiresAt;
    found.updatedAt = input.now;
    return { ...found };
  }

  public async updateStatusCas(
    input: UpdateApiKeyStatusInput,
  ): Promise<ApiKeyRecord | null> {
    const found = this.keys.find(
      (key) =>
        key.keyId === input.keyId &&
        key.employeeId === input.employeeId &&
        key.status === input.expectedStatus,
    );
    if (found === undefined) return null;
    found.status = input.nextStatus;
    found.updatedAt = input.now;
    if (input.nextStatus === "disabled") found.disabledAt = input.now;
    if (input.nextStatus === "active") found.disabledAt = null;
    return { ...found };
  }

  public async rotate(
    input: RotateApiKeyInput,
  ): Promise<{ previous: ApiKeyRecord; created: ApiKeyRecord } | null> {
    const previous = await this.updateStatusCas({
      keyId: input.keyId,
      employeeId: input.employeeId,
      expectedStatus: input.expectedStatus,
      nextStatus: "revoked",
      now: input.now,
    });
    if (previous === null) return null;
    const created = await this.insert(input.replacement);
    return { previous, created };
  }
}

interface Harness {
  service: ModelServiceKeyService;
  repository: FakeRepository;
  audit: ModelServiceAuditPort & { calls: unknown[] };
  setNow: (value: Date) => void;
}

function createHarness(
  overrides: Partial<ModelServiceKeyServiceConfig> = {},
): Harness {
  const repository = new FakeRepository();
  const calls: unknown[] = [];
  const audit = {
    calls,
    recordEvent: vi.fn(async (input: unknown) => {
      calls.push(input);
    }),
  } as unknown as ModelServiceAuditPort & { calls: unknown[] };
  let nowValue = new Date(START);
  const service = new ModelServiceKeyService(
    repository,
    audit,
    {
      hmacSecret: SECRET,
      hmacSecretPrevious: undefined,
      maxRpm: 6000,
      maxTpm: 10_000_000,
      maxDailyTokens: 1_000_000_000,
      maxKeysPerUser: 2,
      ...overrides,
    },
    () => nowValue,
  );
  return {
    service,
    repository,
    audit,
    setNow: (value: Date) => {
      nowValue = value;
    },
  };
}

async function expectErrorCode(
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation()).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof ModelServiceError && error.code === code,
  );
}

describe("模型服务 Key 生命周期（PRD 7.5 / 8.1）", () => {
  it("创建返回一次性明文，库内只留摘要与前缀", async () => {
    const harness = createHarness();
    const result = await harness.service.createKey(actor, {
      name: "notebook-dev",
    });

    expect(result.apiKey.startsWith("sk-aihub-")).toBe(true);
    expect(result.summary.prefix).toBe(result.apiKey.slice(0, 16));
    expect(result.summary.status).toBe("active");
    expect(result.summary.effectiveStatus).toBe("active");

    const stored = harness.repository.keys[0]!;
    expect(stored.keyHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(result.apiKey);
  });

  it("创建持久化限额覆盖，未提供则为 null（表示使用平台默认）", async () => {
    const harness = createHarness();
    const result = await harness.service.createKey(actor, {
      name: "batch-job",
      rpmLimit: 120,
      tpmLimit: 500_000,
    });

    expect(result.summary.limits).toEqual({
      rpm: 120,
      tpm: 500_000,
      dailyTokens: null,
    });
  });

  it("未配置 HMAC 密钥时拒绝创建，而不是生成无法校验的 Key", async () => {
    const harness = createHarness({ hmacSecret: undefined });
    await expectErrorCode(
      () => harness.service.createKey(actor, { name: "blocked" }),
      MODEL_SERVICE_ERROR_CODES.NOT_CONFIGURED,
    );
    // 未配置密钥不影响读取既有 Key
    await expect(harness.service.listKeys(actor, {})).resolves.toMatchObject({
      total: 0,
    });
  });

  it("活跃 Key 达到每人上限时拒绝创建", async () => {
    const harness = createHarness({ maxKeysPerUser: 2 });
    await harness.service.createKey(actor, { name: "one" });
    await harness.service.createKey(actor, { name: "two" });

    await expectErrorCode(
      () => harness.service.createKey(actor, { name: "three" }),
      MODEL_SERVICE_ERROR_CODES.LIMIT_REACHED,
    );
  });

  it("撤销 Key 不占额度，可再次创建同名", async () => {
    const harness = createHarness({ maxKeysPerUser: 1 });
    const first = await harness.service.createKey(actor, { name: "same-name" });
    await harness.service.revokeKey(actor, first.summary.keyId);

    const again = await harness.service.createKey(actor, { name: "same-name" });
    expect(again.summary.keyId).not.toBe(first.summary.keyId);
  });

  it("同名未撤销 Key 拒绝创建（含并发唯一冲突的翻译）", async () => {
    const harness = createHarness();
    await harness.service.createKey(actor, { name: "dup" });
    await expectErrorCode(
      () => harness.service.createKey(actor, { name: "dup" }),
      MODEL_SERVICE_ERROR_CODES.NAME_DUPLICATED,
    );

    // 绕过应用层预检、直接模拟数据库唯一索引命中
    harness.repository.failNextInsertWithUniqueViolation = true;
    await expectErrorCode(
      () => harness.service.createKey(actor, { name: "another" }),
      MODEL_SERVICE_ERROR_CODES.NAME_DUPLICATED,
    );
  });

  it("限额越界或高于平台上限一律 MODEL_KEY_INVALID_LIMIT", async () => {
    const harness = createHarness({ maxRpm: 100 });
    await expectErrorCode(
      () => harness.service.createKey(actor, { name: "a", rpmLimit: 101 }),
      MODEL_SERVICE_ERROR_CODES.INVALID_LIMIT,
    );
    await expectErrorCode(
      () => harness.service.createKey(actor, { name: "b", rpmLimit: 0 }),
      MODEL_SERVICE_ERROR_CODES.INVALID_LIMIT,
    );
    await expectErrorCode(
      () => harness.service.createKey(actor, { name: "c", expiresInDays: 366 }),
      MODEL_SERVICE_ERROR_CODES.INVALID_LIMIT,
    );
  });

  it("有效期按天数换算为绝对时间，且可清除", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, {
      name: "expiring",
      expiresInDays: 10,
    });
    expect(created.summary.expiresAt).toBe("2026-10-23T09:00:00.000Z");

    const cleared = await harness.service.updateKey(
      actor,
      created.summary.keyId,
      { expiresInDays: null },
    );
    expect(cleared.expiresAt).toBeNull();
  });

  it("过期 Key 的派生状态为 expired，存储状态仍为 active", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, {
      name: "soon-expired",
      expiresInDays: 1,
    });

    harness.setNow(new Date("2026-10-20T09:00:00.000Z"));
    const detail = await harness.service.getKey(actor, created.summary.keyId);
    expect(detail.status).toBe("active");
    expect(detail.effectiveStatus).toBe("expired");
  });

  it("列表默认排除已撤销 Key，includeRevoked 可查看", async () => {
    const harness = createHarness({ maxKeysPerUser: 5 });
    const first = await harness.service.createKey(actor, { name: "keep" });
    await harness.service.createKey(actor, { name: "gone" });
    const revokedId = harness.repository.keys.find(
      (key) => key.name === "gone",
    )!.keyId;
    await harness.service.revokeKey(actor, revokedId);

    const activeOnly = await harness.service.listKeys(actor, {});
    expect(activeOnly.items.map((item) => item.name)).toEqual(["keep"]);

    const withRevoked = await harness.service.listKeys(actor, {
      includeRevoked: true,
    });
    expect(withRevoked.total).toBe(2);
    expect(withRevoked.items.map((item) => item.status).sort()).toEqual([
      "active",
      "revoked",
    ]);
    expect(first.summary.keyId).toBeDefined();
  });

  it("列表分页口径：page/pageSize 与 total 一致", async () => {
    const harness = createHarness({ maxKeysPerUser: 5 });
    for (const name of ["k1", "k2", "k3"]) {
      await harness.service.createKey(actor, { name });
    }

    const page = await harness.service.listKeys(actor, {
      page: 2,
      pageSize: 2,
    });
    expect(page.total).toBe(3);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it("访问他人 Key 一律 404 语义（不泄露存在性）", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, { name: "mine" });

    await expectErrorCode(
      () => harness.service.getKey(otherActor, created.summary.keyId),
      MODEL_SERVICE_ERROR_CODES.NOT_FOUND,
    );
    await expectErrorCode(
      () => harness.service.disableKey(otherActor, created.summary.keyId),
      MODEL_SERVICE_ERROR_CODES.NOT_FOUND,
    );
  });

  it("revoked 为终态：变更/启用/轮换均返回状态冲突，删除幂等", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, {
      name: "terminal",
    });
    await harness.service.revokeKey(actor, created.summary.keyId);

    await expectErrorCode(
      () =>
        harness.service.updateKey(actor, created.summary.keyId, { name: "x" }),
      MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT,
    );
    await expectErrorCode(
      () => harness.service.enableKey(actor, created.summary.keyId),
      MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT,
    );
    await expectErrorCode(
      () => harness.service.rotateKey(actor, created.summary.keyId),
      MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT,
    );
    // 删除幂等：再次删除不报错
    await expect(
      harness.service.revokeKey(actor, created.summary.keyId),
    ).resolves.toBeUndefined();
  });

  it("禁用与启用幂等，且 disabled_at 语义正确（启用时清空）", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, { name: "toggle" });

    const disabled = await harness.service.disableKey(
      actor,
      created.summary.keyId,
    );
    expect(disabled.status).toBe("disabled");
    expect(disabled.disabledAt).toBe(START.toISOString());

    harness.setNow(new Date("2026-10-14T09:00:00.000Z"));
    const disabledAgain = await harness.service.disableKey(
      actor,
      created.summary.keyId,
    );
    expect(disabledAgain.disabledAt).toBe(START.toISOString());

    const enabled = await harness.service.enableKey(
      actor,
      created.summary.keyId,
    );
    expect(enabled.status).toBe("active");
    expect(enabled.disabledAt).toBeNull();
    await expect(
      harness.service.enableKey(actor, created.summary.keyId),
    ).resolves.toMatchObject({ status: "active" });
  });

  it("并发状态变更导致 CAS 未命中时返回状态冲突", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, { name: "racing" });
    // 模拟并发：读取后、CAS 前，对方已把状态改成 disabled
    const spy = vi.spyOn(harness.repository, "findById").mockResolvedValueOnce({
      ...harness.repository.keys[0]!,
      status: "active",
    });
    harness.repository.keys[0]!.status = "disabled";

    await expectErrorCode(
      () => harness.service.disableKey(actor, created.summary.keyId),
      MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT,
    );
    spy.mockRestore();
  });

  it("轮换：旧钥同事务撤销、新钥返回明文并记录轮换谱系，沿用原限额", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, {
      name: "rotate-me",
      rpmLimit: 42,
    });

    const rotated = await harness.service.rotateKey(
      actor,
      created.summary.keyId,
    );
    expect(rotated.apiKey).not.toBe("");
    expect(rotated.summary.name).toBe("rotate-me");
    expect(rotated.summary.limits.rpm).toBe(42);

    const previous = harness.repository.keys.find(
      (key) => key.keyId === created.summary.keyId,
    )!;
    expect(previous.status).toBe("revoked");
    expect(rotated.summary.keyId).not.toBe(previous.keyId);
    expect(
      harness.repository.keys.find(
        (key) => key.keyId === rotated.summary.keyId,
      )!.rotatedFromKeyId,
    ).toBe(previous.keyId);
  });

  it("变更名称撞名返回 NAME_DUPLICATED，其他 Key 不受影响", async () => {
    const harness = createHarness({ maxKeysPerUser: 5 });
    const first = await harness.service.createKey(actor, { name: "first" });
    const second = await harness.service.createKey(actor, { name: "second" });

    await expectErrorCode(
      () =>
        harness.service.updateKey(actor, second.summary.keyId, {
          name: "first",
        }),
      MODEL_SERVICE_ERROR_CODES.NAME_DUPLICATED,
    );
    // 改成自己的同名不报错（幂等路径）
    await expect(
      harness.service.updateKey(actor, second.summary.keyId, {
        name: "second",
      }),
    ).resolves.toMatchObject({ name: "second" });
    expect(first.summary.name).toBe("first");
  });

  it("生命周期操作写入安全审计（module=model_service, risk=medium）", async () => {
    const harness = createHarness();
    const created = await harness.service.createKey(actor, { name: "audited" });
    await harness.service.disableKey(actor, created.summary.keyId);
    await harness.service.rotateKey(actor, created.summary.keyId);

    const actions = harness.audit.calls.map(
      (call) => (call as { action: string }).action,
    );
    expect(actions).toEqual([
      "api_key.create",
      "api_key.disable",
      "api_key.rotate",
    ]);
    expect(harness.audit.calls[0]).toMatchObject({
      module: "model_service",
      actorEmployeeId: actor.employeeId,
      result: "success",
      risk: "medium",
    });
    // 审计明细不得包含明文或摘要
    const serialized = JSON.stringify(harness.audit.calls);
    expect(serialized).not.toContain("keyHash");
    expect(serialized).not.toMatch(/sk-aihub-[A-Za-z0-9]{20,}/u);
  });
});
