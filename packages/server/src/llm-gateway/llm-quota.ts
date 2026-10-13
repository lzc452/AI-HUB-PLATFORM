import type { ApiKeyContext } from "./api-key.guard.js";
import { gatewayError } from "./llm-gateway.errors.js";
import {
  businessDayStart,
  secondsUntilNextBusinessDay,
} from "./llm-business-day.js";
import type { LlmCallLogRepository } from "./llm-call-log.repository.js";
import type { ApiKeyLimits } from "./llm-gateway.types.js";

/**
 * 配额与限流（PRD 8.2 / 9.4）。
 *
 * ## 三层口径，各自的事实来源
 *
 * | 维度 | 度量 | 事实来源 | 说明 |
 * | --- | --- | --- | --- |
 * | RPM | 每分钟请求数 | 进程内加权计数器 | 单实例假设（A4）；多实例演进需迁共享存储 |
 * | TPM | 每分钟 token 数 | 进程内加权计数器 | 请求前用估算值预判，请求后按实际值结算 |
 * | 日配额 | 每员工每日 token | `llm_api_call_logs` 实时求和 | **同步记账**，故 DB 即事实来源 |
 *
 * **为什么日配额不再叠「进程内已放行修正」**：PRD 9.4 原本为「记账异步」预留了该修正项。
 * M3 采用同步单行记账（PRD 9.2 的决定），DB 已包含刚发生的调用，修正项反而成为
 * 第二个不一致来源——因此去掉，口径唯一（已在 PRD 回写中说明）。
 *
 * ## 加权计数器与平台限流中间件的区别
 *
 * `system/security/rate-limit.middleware.ts` 的计数器每次 +1（按请求数限流），
 * 而 TPM 需要按 token **加权**累加，因此这里实现加权版本，但沿用其内存安全纪律
 * （容量上限 + 定期清扫 + 逐出最早过期键），避免唯一键洪泛导致内存无界增长。
 */

export interface WeightedFixedWindowCounter {
  /** 累加并返回当前窗口累计值。 */
  add(key: string, amount: number, windowMs: number, nowMs: number): number;
  /** 只读当前窗口累计值（过期为 0）。 */
  peek(key: string, windowMs: number, nowMs: number): number;
  /** 当前窗口剩余秒数（1 起，用于 `Retry-After`）。 */
  remainingSeconds(key: string, windowMs: number, nowMs: number): number;
  size(): number;
  sweepExpired(nowMs: number): number;
}

interface Bucket {
  total: number;
  resetAt: number;
}

export function createWeightedFixedWindowCounter(
  options: { maxBuckets?: number; sweepInterval?: number } = {},
): WeightedFixedWindowCounter {
  const maxBuckets = options.maxBuckets ?? 10_000;
  const sweepInterval = options.sweepInterval ?? 1_000;
  const buckets = new Map<string, Bucket>();
  let operations = 0;

  const sweepExpired = (nowMs: number): number => {
    let removed = 0;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= nowMs) {
        buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  };

  const evictOldest = (): void => {
    let oldestKey: string | undefined;
    let oldestResetAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < oldestResetAt) {
        oldestResetAt = bucket.resetAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  };

  /** 取出未过期的桶；调用方决定是否修改。 */
  const liveBucket = (
    key: string,
    windowMs: number,
    nowMs: number,
    create: boolean,
  ): Bucket | undefined => {
    const existing = buckets.get(key);
    if (existing !== undefined && existing.resetAt > nowMs) return existing;
    if (!create) {
      if (existing !== undefined) buckets.delete(key);
      return undefined;
    }
    if (existing !== undefined) buckets.delete(key);
    if (buckets.size >= maxBuckets) {
      sweepExpired(nowMs);
      if (buckets.size >= maxBuckets) evictOldest();
    }
    const created: Bucket = { total: 0, resetAt: nowMs + windowMs };
    buckets.set(key, created);
    return created;
  };

  const maybeSweep = (nowMs: number): void => {
    operations += 1;
    if (operations >= sweepInterval) {
      sweepExpired(nowMs);
      operations = 0;
    }
  };

  return {
    add(key, amount, windowMs, nowMs) {
      maybeSweep(nowMs);
      const bucket = liveBucket(key, windowMs, nowMs, true)!;
      bucket.total += Math.max(0, amount);
      return bucket.total;
    },
    peek(key, windowMs, nowMs) {
      return liveBucket(key, windowMs, nowMs, false)?.total ?? 0;
    },
    remainingSeconds(key, windowMs, nowMs) {
      const bucket = liveBucket(key, windowMs, nowMs, false);
      if (bucket === undefined) return Math.ceil(windowMs / 1000);
      return Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000));
    },
    size() {
      return buckets.size;
    },
    sweepExpired,
  };
}

const RPM_WINDOW_MS = 60_000;
const TPM_WINDOW_MS = 60_000;

export interface QuotaDefaults {
  rpm: number;
  tpm: number;
  dailyTokens: number;
}

/** Key 覆盖优先，否则平台默认（PRD 8.1：`null` 表示使用平台默认）。 */
export function resolveLimits(
  limits: ApiKeyLimits,
  defaults: QuotaDefaults,
): QuotaDefaults {
  return {
    rpm: limits.rpm ?? defaults.rpm,
    tpm: limits.tpm ?? defaults.tpm,
    dailyTokens: limits.dailyTokens ?? defaults.dailyTokens,
  };
}

export interface LlmQuotaServiceOptions {
  counters: WeightedFixedWindowCounter;
  callLogs: LlmCallLogRepository;
  defaults: QuotaDefaults;
  now?: () => Date;
}

export class LlmQuotaService {
  private readonly counters: WeightedFixedWindowCounter;
  private readonly callLogs: LlmCallLogRepository;
  private readonly defaults: QuotaDefaults;
  private readonly now: () => Date;

  public constructor(options: LlmQuotaServiceOptions) {
    this.counters = options.counters;
    this.callLogs = options.callLogs;
    this.defaults = options.defaults;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * 请求前判定。任一维度超限即抛 429（带 `Retry-After`），
   * 判定顺序为「日配额 → RPM → TPM」：日配额是最终上限，先判可避免无意义的计数。
   */
  public async assertWithinQuota(
    apiKey: ApiKeyContext,
    estimatedTokens: number,
  ): Promise<void> {
    const limits = resolveLimits(apiKey.limits, this.defaults);
    const at = this.now();
    const nowMs = at.getTime();

    const usedToday = await this.callLogs.sumTokensSince({
      employeeId: apiKey.employeeId,
      since: businessDayStart(at),
    });
    if (usedToday + estimatedTokens > limits.dailyTokens) {
      throw gatewayError("RATE_LIMITED", {
        detail: `daily quota exceeded: used ${usedToday}/${limits.dailyTokens} tokens`,
        retryAfterSeconds: secondsUntilNextBusinessDay(at),
      });
    }

    const rpmKey = `rpm:${apiKey.keyId}`;
    const rpmCount = this.counters.add(rpmKey, 1, RPM_WINDOW_MS, nowMs);
    if (rpmCount > limits.rpm) {
      throw gatewayError("RATE_LIMITED", {
        detail: `rpm limit exceeded: ${rpmCount}/${limits.rpm} per minute`,
        retryAfterSeconds: this.counters.remainingSeconds(
          rpmKey,
          RPM_WINDOW_MS,
          nowMs,
        ),
      });
    }

    const tpmKey = `tpm:${apiKey.keyId}`;
    const tpmUsed = this.counters.peek(tpmKey, TPM_WINDOW_MS, nowMs);
    if (tpmUsed + estimatedTokens > limits.tpm) {
      throw gatewayError("RATE_LIMITED", {
        detail: `tpm limit exceeded: ${tpmUsed}+${estimatedTokens}/${limits.tpm} tokens per minute`,
        retryAfterSeconds: this.counters.remainingSeconds(
          tpmKey,
          TPM_WINDOW_MS,
          nowMs,
        ),
      });
    }
  }

  /** 请求后按实际用量结算 TPM（失败/拒绝也调用，amount 可为 0）。 */
  public settle(apiKey: ApiKeyContext, tokens: number): void {
    if (tokens <= 0) return;
    const nowMs = this.now().getTime();
    this.counters.add(`tpm:${apiKey.keyId}`, tokens, TPM_WINDOW_MS, nowMs);
  }

  /** 观测用：当前窗口计数（M5 指标会消费）。 */
  public inspect(apiKey: ApiKeyContext): { rpm: number; tpm: number } {
    const nowMs = this.now().getTime();
    return {
      rpm: this.counters.peek(`rpm:${apiKey.keyId}`, RPM_WINDOW_MS, nowMs),
      tpm: this.counters.peek(`tpm:${apiKey.keyId}`, TPM_WINDOW_MS, nowMs),
    };
  }
}

/**
 * 无效 Key 的 IP 级预检（PRD 8.3：「网关侧对无效 Key 洪泛的 IP 级预检」）。
 *
 * 为什么需要它：`/v1` 不做 Cookie 会话校验，未授权请求的唯一成本就是一次摘要查库。
 * 攻击者用随机 Key 高频试探时，限流器（按 Key 维度）完全不起作用——因为每个假 Key
 * 都是一次性维度。这里按**来源 IP** 对「凭据无效」的失败次数做固定窗口限制。
 *
 * 只统计「凭据无效」（缺头/查不到），不统计 disabled/revoked/expired：
 * 后者是合法 Key 的状态问题，用户不该因为自己轮换了 Key 而被当成攻击者。
 */
export interface InvalidKeyThrottle {
  /** 记录一次无效凭据尝试；返回 true 表示已超限（调用方应返回 429）。 */
  register(ip: string): boolean;
  retryAfterSeconds(ip: string): number;
}

export const INVALID_KEY_WINDOW_MS = 60_000;
export const INVALID_KEY_MAX_ATTEMPTS = 30;

export function createInvalidKeyThrottle(
  options: {
    counters?: WeightedFixedWindowCounter;
    windowMs?: number;
    max?: number;
    now?: () => number;
  } = {},
): InvalidKeyThrottle {
  const counters =
    options.counters ?? createWeightedFixedWindowCounter({ maxBuckets: 5_000 });
  const windowMs = options.windowMs ?? INVALID_KEY_WINDOW_MS;
  const max = options.max ?? INVALID_KEY_MAX_ATTEMPTS;
  const now = options.now ?? Date.now;
  const key = (ip: string): string => `invalid-key:${ip}`;

  return {
    register(ip) {
      const attempts = counters.add(key(ip), 1, windowMs, now());
      return attempts > max;
    },
    retryAfterSeconds(ip) {
      return counters.remainingSeconds(key(ip), windowMs, now());
    },
  };
}
