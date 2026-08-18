// rate-limit.middleware.ts
export interface RateLimitRule {
  matcher: (path: string) => boolean;
  windowMs: number;
  max: number;
  keySource: "ip" | "ip+account";
}

interface RateLimitOptions {
  limits: ReadonlyArray<RateLimitRule>;
  now?: () => number;
}

interface FixedWindowBucket {
  count: number;
  resetAt: number;
}

export interface FixedWindowCounterOptions {
  /** 跟踪键数上限；达到上限时先清扫过期键，仍满则逐出最早过期的键。默认 10_000。 */
  maxBuckets?: number;
  /** 每 N 次 increment 清扫一次过期键。默认 1_000。 */
  sweepInterval?: number;
}

export interface FixedWindowCounter {
  /** 记录一次尝试并返回该键在当前窗口内的累计次数（是否超限由调用方判定）。 */
  increment(key: string, windowMs: number, nowMs: number): number;
  /** 当前已跟踪的键数量（观测/测试用）。 */
  size(): number;
  /** 删除 resetAt 已过期的键，返回删除数量。 */
  sweepExpired(nowMs: number): number;
}

/** 进程内固定窗口计数。带定期清扫与容量上限（过期清扫 + 逐出最早过期键），
 * 防唯一键洪泛导致内存无界增长；纯函数式、无定时器，可注入时间用于测试。 */
export function createFixedWindowCounter(
  options: FixedWindowCounterOptions = {},
): FixedWindowCounter {
  const maxBuckets = options.maxBuckets ?? 10_000;
  const sweepInterval = options.sweepInterval ?? 1_000;
  const buckets = new Map<string, FixedWindowBucket>();
  let incrementsSinceSweep = 0;

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
    if (oldestKey !== undefined) {
      buckets.delete(oldestKey);
    }
  };

  return {
    increment(key, windowMs, nowMs) {
      incrementsSinceSweep += 1;
      if (incrementsSinceSweep >= sweepInterval) {
        sweepExpired(nowMs);
        incrementsSinceSweep = 0;
      }
      const existing = buckets.get(key);
      if (existing === undefined || existing.resetAt <= nowMs) {
        if (existing === undefined && buckets.size >= maxBuckets) {
          sweepExpired(nowMs);
          if (buckets.size >= maxBuckets) {
            evictOldest();
          }
        }
        buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
        return 1;
      }
      existing.count += 1;
      return existing.count;
    },
    size() {
      return buckets.size;
    },
    sweepExpired,
  };
}

/** 进程内固定窗口限流。模块化单体单实例时有效；双机部署按实例计数（V1 可接受）。 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  const now = options.now ?? Date.now;
  const counter = createFixedWindowCounter();
  const accountBucketKey = (req: unknown): string => {
    const body = (req as { body?: unknown }).body;
    if (typeof body === "object" && body !== null) {
      const employeeNumber = (body as { employeeNumber?: unknown })
        .employeeNumber;
      if (typeof employeeNumber === "string") return employeeNumber;
    }
    return "unknown";
  };
  return (req: unknown, res: unknown, next: () => void) => {
    const request = req as { path: string; ip: string };
    const response = res as {
      status: (code: number) => { json: (body: unknown) => void };
    };
    const nowMs = now();
    for (const [ruleIndex, rule] of options.limits.entries()) {
      if (!rule.matcher(request.path)) continue;
      // 每条规则独立命名空间（rule:<i>:…）：password 与 challenge 等规则互不消耗配额。
      const dimensionKey =
        rule.keySource === "ip+account"
          ? `account:${accountBucketKey(req)}`
          : `ip:${request.ip}`;
      const count = counter.increment(
        `rule:${ruleIndex}:${dimensionKey}`,
        rule.windowMs,
        nowMs,
      );
      if (count > rule.max) {
        response.status(429).json({
          type: "https://ai-hub.local/problems/rate-limit",
          title: "请求过于频繁",
          status: 429,
          code: "RATE_LIMITED",
          detail: "请稍后重试",
          traceId: "",
        });
        return;
      }
    }
    next();
  };
}
