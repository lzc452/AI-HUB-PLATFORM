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

/** 进程内滑动窗口限流。模块化单体单实例时有效；双机部署按实例计数（V1 可接受）。 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();
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
    for (const rule of options.limits) {
      if (!rule.matcher(request.path)) continue;
      const ipKey = `ip:${request.ip}`;
      const key =
        rule.keySource === "ip+account"
          ? `account:${accountBucketKey(req)}`
          : ipKey;
      const nowMs = now();
      const bucket = buckets.get(key);
      if (bucket === undefined || bucket.resetAt <= nowMs) {
        buckets.set(key, { count: 1, resetAt: nowMs + rule.windowMs });
      } else {
        bucket.count += 1;
        if (bucket.count > rule.max) {
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
    }
    next();
  };
}
