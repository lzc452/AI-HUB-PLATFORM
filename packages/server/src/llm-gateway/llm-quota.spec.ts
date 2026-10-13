import { describe, expect, it } from "vitest";
import type { ApiKeyContext } from "./api-key.guard.js";
import type { LlmCallLogRepository } from "./llm-call-log.repository.js";
import { GatewayApiError } from "./llm-gateway.errors.js";
import {
  createInvalidKeyThrottle,
  createWeightedFixedWindowCounter,
  LlmQuotaService,
  resolveLimits,
  type QuotaDefaults,
} from "./llm-quota.js";

const NOW_MS = Date.parse("2026-10-13T09:00:00.000Z");

function apiKey(limits: ApiKeyContext["limits"]): ApiKeyContext {
  return {
    keyId: "key-1",
    employeeId: "E100",
    keyPrefix: "sk-aihub-abcdefg",
    limits,
  };
}

const DEFAULTS: QuotaDefaults = {
  rpm: 60,
  tpm: 100_000,
  dailyTokens: 1_000_000,
};

function callLogs(usedTokens = 0): LlmCallLogRepository {
  return {
    async insert() {
      return undefined;
    },
    async sumTokensSince() {
      return usedTokens;
    },
  };
}

function quota(options: {
  usedTokens?: number;
  defaults?: QuotaDefaults;
  nowMs?: number;
}) {
  const counters = createWeightedFixedWindowCounter();
  const service = new LlmQuotaService({
    counters,
    callLogs: callLogs(options.usedTokens ?? 0),
    defaults: options.defaults ?? DEFAULTS,
    now: () => new Date(options.nowMs ?? NOW_MS),
  });
  return { service, counters };
}

async function expectQuotaError(operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayApiError);
    return (error as GatewayApiError).descriptor;
  }
  throw new Error("期望抛出配额错误");
}

describe("加权固定窗口计数器", () => {
  it("按权重累加，窗口过期后重新计数", () => {
    const counter = createWeightedFixedWindowCounter();
    expect(counter.add("k", 5, 1000, 0)).toBe(5);
    expect(counter.add("k", 3, 1000, 100)).toBe(8);
    expect(counter.peek("k", 1000, 500)).toBe(8);
    // 窗口过期 → 归零重来
    expect(counter.peek("k", 1000, 1000)).toBe(0);
    expect(counter.add("k", 2, 1000, 1000)).toBe(2);
  });

  it("剩余秒数为正整数，未创建时给出整窗时长", () => {
    const counter = createWeightedFixedWindowCounter();
    expect(counter.remainingSeconds("missing", 60_000, 0)).toBe(60);
    counter.add("k", 1, 60_000, 0);
    expect(counter.remainingSeconds("k", 60_000, 1_000)).toBe(59);
    expect(counter.remainingSeconds("k", 60_000, 59_999)).toBe(1);
  });

  it("容量上限 + 过期清扫：唯一键洪泛不会让内存无界增长", () => {
    const counter = createWeightedFixedWindowCounter({
      maxBuckets: 10,
      sweepInterval: 1,
    });
    for (let index = 0; index < 100; index += 1) {
      counter.add(`key-${index}`, 1, 1_000, index * 10);
    }
    expect(counter.size()).toBeLessThanOrEqual(10);
    // 全部过期后清扫归零
    expect(counter.sweepExpired(100_000)).toBeGreaterThan(0);
  });
});

describe("限额解析", () => {
  it("Key 覆盖优先，null 回落到平台默认", () => {
    expect(
      resolveLimits({ rpm: 10, tpm: null, dailyTokens: 5 }, DEFAULTS),
    ).toEqual({
      rpm: 10,
      tpm: DEFAULTS.tpm,
      dailyTokens: 5,
    });
    expect(
      resolveLimits({ rpm: null, tpm: null, dailyTokens: null }, DEFAULTS),
    ).toEqual(DEFAULTS);
  });
});

describe("LlmQuotaService", () => {
  it("放行时不做任何拒绝；RPM 计数随调用累加", async () => {
    const { service } = quota({
      defaults: { rpm: 3, tpm: 1_000, dailyTokens: 1_000 },
    });
    const key = apiKey({ rpm: null, tpm: null, dailyTokens: null });
    await service.assertWithinQuota(key, 10);
    await service.assertWithinQuota(key, 10);
    expect(service.inspect(key).rpm).toBe(2);
  });

  it("超过 RPM 上限返回 429，Retry-After 为窗口剩余秒数", async () => {
    const { service } = quota({
      defaults: { rpm: 1, tpm: 1_000, dailyTokens: 1_000 },
    });
    const key = apiKey({ rpm: null, tpm: null, dailyTokens: null });
    await service.assertWithinQuota(key, 1);
    const descriptor = await expectQuotaError(() =>
      service.assertWithinQuota(key, 1),
    );
    expect(descriptor.code).toBe("rate_limit_exceeded");
    expect(descriptor.status).toBe(429);
    expect(descriptor.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("TPM 用估算值预判、按实际值结算（避免「先放行后爆表」）", async () => {
    const { service } = quota({
      defaults: { rpm: 100, tpm: 100, dailyTokens: 1_000 },
    });
    const key = apiKey({ rpm: null, tpm: null, dailyTokens: null });
    // 已结算 90 → 再预估 20 会超 100
    service.settle(key, 90);
    const descriptor = await expectQuotaError(() =>
      service.assertWithinQuota(key, 20),
    );
    expect(descriptor.code).toBe("rate_limit_exceeded");
    // 诊断信息进入 message（不新增信封字段，保持 OpenAI 形状）
    expect(descriptor.message).toContain("tpm limit exceeded");
    // 预估 5 仍可放行
    await expect(service.assertWithinQuota(key, 5)).resolves.toBeUndefined();
  });

  it("日配额以员工维度累计（不同 Key 共享同一额度）", async () => {
    const { service } = quota({
      usedTokens: 999_999,
      defaults: { rpm: 100, tpm: 1_000_000, dailyTokens: 1_000_000 },
    });
    const first = apiKey({ rpm: null, tpm: null, dailyTokens: null });
    const second = { ...first, keyId: "key-2" };
    // 第一个 Key 通过（估算很小）
    await expect(service.assertWithinQuota(first, 1)).resolves.toBeUndefined();
    // 但日额度已用满 → 第二个 Key 同样被拒（日配额是员工维度而非 Key 维度）
    const descriptor = await expectQuotaError(() =>
      service.assertWithinQuota(second, 10_000),
    );
    expect(descriptor.retryAfterSeconds).toBe(25_200);
  });

  it("settle 为 0 时不产生计数污染", () => {
    const { service } = quota({});
    const key = apiKey({ rpm: null, tpm: null, dailyTokens: null });
    service.settle(key, 0);
    expect(service.inspect(key).tpm).toBe(0);
  });
});

describe("无效 Key 的 IP 级预检", () => {
  it("超过窗口上限后判定超限，并给出剩余秒数", () => {
    let nowMs = NOW_MS;
    const throttle = createInvalidKeyThrottle({
      max: 3,
      windowMs: 60_000,
      now: () => nowMs,
    });
    expect(throttle.register("10.0.0.1")).toBe(false);
    expect(throttle.register("10.0.0.1")).toBe(false);
    expect(throttle.register("10.0.0.1")).toBe(false);
    expect(throttle.register("10.0.0.1")).toBe(true);
    expect(throttle.retryAfterSeconds("10.0.0.1")).toBeLessThanOrEqual(60);

    // 不同 IP 互不影响
    expect(throttle.register("10.0.0.2")).toBe(false);

    // 窗口过期后恢复
    nowMs += 60_001;
    expect(throttle.register("10.0.0.1")).toBe(false);
  });
});
