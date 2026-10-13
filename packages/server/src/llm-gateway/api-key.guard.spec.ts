import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  ApiKeyGuard,
  parseBearerToken,
  type GatewayRequest,
} from "./api-key.guard.js";
import { createApiKeyHasher } from "./api-key.hasher.js";
import { GatewayApiError } from "./llm-gateway.errors.js";
import type { LlmCallLogRepository } from "./llm-call-log.repository.js";
import type { InvalidKeyThrottle } from "./llm-quota.js";
import type { ModelServiceKeyRepository } from "./model-service-key.repository.js";
import type { ApiKeyRecord } from "./llm-gateway.types.js";

const CURRENT = "0123456789abcdef0123456789abcdef";
const PREVIOUS = "fedcba9876543210fedcba9876543210";
const NOW = new Date("2026-10-13T09:00:00.000Z");

/** 捕获状态类拒绝台账的桩；守卫用它证明「被拒也留痕」。 */
function rejectionLogs(): LlmCallLogRepository & {
  entries: Array<{ errorCode: string | null; statusCode: number }>;
} {
  const entries: Array<{ errorCode: string | null; statusCode: number }> = [];
  return {
    entries,
    async insert(input) {
      entries.push({
        errorCode: input.errorCode,
        statusCode: input.statusCode,
      });
    },
    async sumTokensSince() {
      return 0;
    },
  };
}

/** 默认放行（不触发 IP 预检）的节流桩。 */
function permissiveThrottle(): InvalidKeyThrottle {
  return {
    register: () => false,
    retryAfterSeconds: () => 30,
  };
}
const EMPLOYEE = "E100";

function record(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    keyId: "key-1",
    employeeId: EMPLOYEE,
    name: "demo",
    keyPrefix: "sk-aihub-abcdefg",
    keyHash: "hash",
    status: "active",
    limits: { rpm: null, tpm: null, dailyTokens: null },
    expiresAt: null,
    lastUsedAt: null,
    rotatedFromKeyId: null,
    createdAt: NOW,
    updatedAt: NOW,
    disabledAt: null,
    ...overrides,
  };
}

interface StubRepository extends ModelServiceKeyRepository {
  readonly seenHashes: string[][];
}

function stubRepository(options: {
  found?: ApiKeyRecord | null;
  employeeStatus?: string | null;
}): StubRepository {
  const seenHashes: string[][] = [];
  const notImplemented = (): never => {
    throw new Error("NOT_IMPLEMENTED_IN_TEST");
  };
  return {
    seenHashes,
    async findByHashes(hashes: readonly string[]) {
      seenHashes.push([...hashes]);
      return options.found ?? null;
    },
    async findEmployeeStatus() {
      return options.employeeStatus ?? "active";
    },
    async touchLastUsedAt() {
      return undefined;
    },
    insert: notImplemented,
    findById: notImplemented,
    findByHash: notImplemented,
    findHoldingByName: notImplemented,
    countHoldingKeys: notImplemented,
    listByEmployee: notImplemented,
    updateAttributes: notImplemented,
    updateStatusCas: notImplemented,
    rotate: notImplemented,
  } as unknown as StubRepository;
}

function contextFor(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: GatewayRequest;
} {
  const request: GatewayRequest = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

async function expectGatewayError(
  operation: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  await expect(operation()).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof GatewayApiError &&
      error.descriptor.code === code &&
      error.descriptor.status === status,
  );
}

describe("parseBearerToken", () => {
  it("解析 Bearer 凭据，scheme 大小写不敏感且容忍两侧空白", () => {
    expect(parseBearerToken("Bearer sk-aihub-abc")).toBe("sk-aihub-abc");
    expect(parseBearerToken("bearer   sk-aihub-abc  ")).toBe("sk-aihub-abc");
    expect(parseBearerToken("BEARER sk-aihub-abc")).toBe("sk-aihub-abc");
  });

  it("拒绝缺失、空值、非 Bearer 与多值头", () => {
    expect(parseBearerToken(undefined)).toBeUndefined();
    expect(parseBearerToken("")).toBeUndefined();
    expect(parseBearerToken("Bearer")).toBeUndefined();
    expect(parseBearerToken("Bearer ")).toBeUndefined();
    expect(parseBearerToken("Basic sk-aihub-abc")).toBeUndefined();
    expect(parseBearerToken(["Bearer a", "Bearer b"])).toBeUndefined();
  });
});

describe("ApiKeyGuard（PRD 8.2 鉴权链）", () => {
  const hasher = createApiKeyHasher({ secret: CURRENT });

  it("缺少 Authorization 头返回 401 invalid_api_key", async () => {
    const guard = new ApiKeyGuard(
      stubRepository({ found: record() }),
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
    );
    const { context } = contextFor({});
    await expectGatewayError(
      () => guard.canActivate(context),
      "invalid_api_key",
      401,
    );
  });

  it("格式错误（非 Bearer）返回 401", async () => {
    const guard = new ApiKeyGuard(
      stubRepository({ found: record() }),
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
    );
    const { context } = contextFor({ authorization: "Token abc" });
    await expectGatewayError(
      () => guard.canActivate(context),
      "invalid_api_key",
      401,
    );
  });

  it("摘要查不到记录返回 401（不区分「不存在」与「密钥不匹配」）", async () => {
    const guard = new ApiKeyGuard(
      stubRepository({ found: null }),
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
    );
    const { context } = contextFor({
      authorization: "Bearer sk-aihub-unknown",
    });
    await expectGatewayError(
      () => guard.canActivate(context),
      "invalid_api_key",
      401,
    );
  });

  it("disabled / revoked 返回 403 对应码", async () => {
    const disabled = new ApiKeyGuard(
      stubRepository({ found: record({ status: "disabled" }) }),
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
    );
    await expectGatewayError(
      () =>
        disabled.canActivate(contextFor({ authorization: "Bearer x" }).context),
      "key_disabled",
      403,
    );

    const revoked = new ApiKeyGuard(
      stubRepository({ found: record({ status: "revoked" }) }),
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
    );
    await expectGatewayError(
      () =>
        revoked.canActivate(contextFor({ authorization: "Bearer x" }).context),
      "key_revoked",
      403,
    );
  });

  it("已过期返回 403 key_expired 且带上过期时间", async () => {
    const guard = new ApiKeyGuard(
      stubRepository({
        found: record({ expiresAt: new Date("2026-10-12T09:00:00.000Z") }),
      }),
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
      () => NOW,
    );
    const { context } = contextFor({ authorization: "Bearer x" });
    await expect(guard.canActivate(context)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GatewayApiError &&
        error.descriptor.code === "key_expired" &&
        error.descriptor.message.includes("2026-10-12T09:00:00.000Z"),
    );
  });

  it("所属员工非在职返回 403 employee_inactive", async () => {
    const guard = new ApiKeyGuard(
      stubRepository({ found: record(), employeeStatus: "disabled" }),
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
    );
    const { context } = contextFor({ authorization: "Bearer x" });
    await expectGatewayError(
      () => guard.canActivate(context),
      "employee_inactive",
      403,
    );
  });

  it("通过时挂载 apiKey 上下文并返回 true", async () => {
    const repository = stubRepository({ found: record() });
    const guard = new ApiKeyGuard(
      repository,
      hasher,
      permissiveThrottle(),
      rejectionLogs(),
      () => NOW,
    );
    const generated = hasher.generate();
    const { context, request } = contextFor({
      authorization: `Bearer ${generated.plaintext}`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.apiKey).toEqual({
      keyId: "key-1",
      employeeId: EMPLOYEE,
      keyPrefix: "sk-aihub-abcdefg",
      limits: { rpm: null, tpm: null, dailyTokens: null },
    });
  });

  it("双密钥过渡期把新旧两个候选摘要都交给仓储查询", async () => {
    const rotating = createApiKeyHasher({
      secret: CURRENT,
      previousSecret: PREVIOUS,
    });
    const legacy = createApiKeyHasher({ secret: PREVIOUS }).generate();
    const repository = stubRepository({ found: record() });
    const guard = new ApiKeyGuard(
      repository,
      rotating,
      permissiveThrottle(),
      rejectionLogs(),
    );

    await guard.canActivate(
      contextFor({ authorization: `Bearer ${legacy.plaintext}` }).context,
    );
    expect(repository.seenHashes[0]).toHaveLength(2);
    expect(repository.seenHashes[0]).toContain(legacy.hash);
  });

  it("未配置 HMAC 密钥返回 503（配置问题不该伪装成凭据问题）", async () => {
    const guard = new ApiKeyGuard(
      stubRepository({ found: record() }),
      undefined,
      permissiveThrottle(),
      rejectionLogs(),
    );
    const { context } = contextFor({ authorization: "Bearer x" });
    await expectGatewayError(
      () => guard.canActivate(context),
      "gateway_not_configured",
      503,
    );
  });
});

describe("无效凭据的 IP 级预检（PRD 8.3）", () => {
  it("超过窗口上限后把 401 升级为 429 并带 Retry-After", async () => {
    let attempts = 0;
    const throttle: InvalidKeyThrottle = {
      register: () => {
        attempts += 1;
        return attempts > 3; // 第 4 次起超限
      },
      retryAfterSeconds: () => 42,
    };
    const guard = new ApiKeyGuard(
      stubRepository({ found: null }),
      createApiKeyHasher({ secret: CURRENT }),
      throttle,
      rejectionLogs(),
    );

    for (let index = 0; index < 3; index += 1) {
      await expectGatewayError(
        () =>
          guard.canActivate(
            contextFor({ authorization: "Bearer nope" }).context,
          ),
        "invalid_api_key",
        401,
      );
    }
    const error = await (async () => {
      try {
        await guard.canActivate(
          contextFor({ authorization: "Bearer nope" }).context,
        );
      } catch (thrown) {
        return thrown as GatewayApiError;
      }
      throw new Error("期望抛出 GatewayApiError");
    })();
    expect(error.descriptor.code).toBe("rate_limit_exceeded");
    expect(error.descriptor.status).toBe(429);
    expect(error.descriptor.retryAfterSeconds).toBe(42);
  });

  it("缺失 Authorization 头同样计入洪泛（无凭据试探也是试探）", async () => {
    let registerCalls = 0;
    const throttle: InvalidKeyThrottle = {
      register: () => {
        registerCalls += 1;
        return false;
      },
      retryAfterSeconds: () => 30,
    };
    const guard = new ApiKeyGuard(
      stubRepository({ found: record() }),
      createApiKeyHasher({ secret: CURRENT }),
      throttle,
      rejectionLogs(),
    );
    await expectGatewayError(
      () => guard.canActivate(contextFor({}).context),
      "invalid_api_key",
      401,
    );
    expect(registerCalls).toBe(1);
  });

  it("合法 Key 的状态问题不计入洪泛（避免轮换 Key 的用户被限流）", async () => {
    let registerCalls = 0;
    const throttle: InvalidKeyThrottle = {
      register: () => {
        registerCalls += 1;
        return false;
      },
      retryAfterSeconds: () => 30,
    };
    const guard = new ApiKeyGuard(
      stubRepository({ found: record({ status: "revoked" }) }),
      createApiKeyHasher({ secret: CURRENT }),
      throttle,
      rejectionLogs(),
    );
    await expectGatewayError(
      () =>
        guard.canActivate(contextFor({ authorization: "Bearer x" }).context),
      "key_revoked",
      403,
    );
    expect(registerCalls).toBe(0);
  });
});
