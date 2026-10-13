import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  ApiKeyGuard,
  parseBearerToken,
  type GatewayRequest,
} from "./api-key.guard.js";
import { createApiKeyHasher } from "./api-key.hasher.js";
import { GatewayApiError } from "./llm-gateway.errors.js";
import type { ModelServiceKeyRepository } from "./model-service-key.repository.js";
import type { ApiKeyRecord } from "./llm-gateway.types.js";

const CURRENT = "0123456789abcdef0123456789abcdef";
const PREVIOUS = "fedcba9876543210fedcba9876543210";
const NOW = new Date("2026-10-13T09:00:00.000Z");
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
    const guard = new ApiKeyGuard(stubRepository({ found: record() }), hasher);
    const { context } = contextFor({});
    await expectGatewayError(
      () => guard.canActivate(context),
      "invalid_api_key",
      401,
    );
  });

  it("格式错误（非 Bearer）返回 401", async () => {
    const guard = new ApiKeyGuard(stubRepository({ found: record() }), hasher);
    const { context } = contextFor({ authorization: "Token abc" });
    await expectGatewayError(
      () => guard.canActivate(context),
      "invalid_api_key",
      401,
    );
  });

  it("摘要查不到记录返回 401（不区分「不存在」与「密钥不匹配」）", async () => {
    const guard = new ApiKeyGuard(stubRepository({ found: null }), hasher);
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
    const guard = new ApiKeyGuard(repository, hasher, () => NOW);
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
    const guard = new ApiKeyGuard(repository, rotating);

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
    );
    const { context } = contextFor({ authorization: "Bearer x" });
    await expectGatewayError(
      () => guard.canActivate(context),
      "gateway_not_configured",
      503,
    );
  });
});
