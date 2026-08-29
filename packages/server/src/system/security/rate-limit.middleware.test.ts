// rate-limit.middleware.test.ts
import { describe, it, expect } from "vitest";
import {
  createFixedWindowCounter,
  createRateLimitMiddleware,
} from "./rate-limit.middleware.js";

function callMw(
  mw: (req: unknown, res: unknown, next: () => void) => void,
  path: string,
  ip: string,
  employeeNumber?: string,
  method?: string,
) {
  const req = {
    path,
    ip,
    method,
    headers: {},
    body: employeeNumber === undefined ? undefined : { employeeNumber },
  };
  let status = 0;
  let json: unknown = null;
  let nexted = false;
  const res = {
    status: (s: number) => {
      status = s;
      return {
        json: (j: unknown) => {
          json = j;
        },
      };
    },
  };
  mw(req, res, () => {
    nexted = true;
  });
  return { status, json, nexted };
}

describe("rate limit middleware", () => {
  it("blocks the 6th login attempt within a minute from the same IP", () => {
    const mw = createRateLimitMiddleware({
      limits: [
        {
          matcher: (p) => p === "/internal/login/password",
          windowMs: 60_000,
          max: 5,
          keySource: "ip",
        },
      ],
    });
    for (let i = 0; i < 5; i++) {
      const r = callMw(mw, "/internal/login/password", "10.0.0.1");
      expect(r.nexted).toBe(true);
    }
    const blocked = callMw(mw, "/internal/login/password", "10.0.0.1");
    expect(blocked.nexted).toBe(false);
    expect(blocked.status).toBe(429);
  });

  it("counts accounts separately from IPs", () => {
    const mw = createRateLimitMiddleware({
      limits: [
        {
          matcher: (p) => p === "/internal/login/password",
          windowMs: 60_000,
          max: 6,
          keySource: "ip",
        },
        {
          matcher: (p) => p === "/internal/login/password",
          windowMs: 60_000,
          max: 2,
          keySource: "ip+account",
        },
      ],
    });
    // 3 个不同账号、同一 IP 各 2 次 → 账号维度分开计数（每账号 2 ≤ 2），IP 合计 6 ≤ 6，全部放行
    for (let i = 0; i < 2; i++) {
      for (const acc of ["a", "b", "c"]) {
        // 通过 body 提取账号
        const r = callMw(mw, "/internal/login/password", "10.0.0.1", acc);
        expect(r.nexted).toBe(true);
      }
    }
    // 同一账号（a）第 3 次、来自新 IP（IP 维度 1 ≤ 6 放行）→ 账号计数 3 > 2 → 429
    const blocked = callMw(mw, "/internal/login/password", "10.0.0.2", "a");
    expect(blocked.status).toBe(429);
  });

  it("keeps password and challenge rule quotas independent", () => {
    const mw = createRateLimitMiddleware({
      limits: [
        {
          matcher: (p) => p === "/internal/login/password",
          windowMs: 60_000,
          max: 5,
          keySource: "ip",
        },
        {
          matcher: (p) => p === "/internal/login/challenge",
          windowMs: 60_000,
          max: 10,
          keySource: "ip",
        },
      ],
    });
    // 同一 IP 先打满 challenge 规则（10 次）→ 不影响 password 规则配额
    for (let i = 0; i < 10; i++) {
      const r = callMw(mw, "/internal/login/challenge", "10.0.0.1");
      expect(r.nexted).toBe(true);
    }
    for (let i = 0; i < 5; i++) {
      const r = callMw(mw, "/internal/login/password", "10.0.0.1");
      expect(r.nexted).toBe(true);
    }
    // password 第 6 次才触发自己的 429；challenge 第 11 次也触发自己的 429
    const blockedPassword = callMw(mw, "/internal/login/password", "10.0.0.1");
    expect(blockedPassword.nexted).toBe(false);
    expect(blockedPassword.status).toBe(429);
    const blockedChallenge = callMw(
      mw,
      "/internal/login/challenge",
      "10.0.0.1",
    );
    expect(blockedChallenge.nexted).toBe(false);
    expect(blockedChallenge.status).toBe(429);
  });

  it("matches rules by HTTP method and limits anonymous portal reads by IP", () => {
    const mw = createRateLimitMiddleware({
      limits: [
        {
          matcher: (p, m) => m === "GET" && p.startsWith("/internal/portal/"),
          windowMs: 60_000,
          max: 3,
          keySource: "ip",
        },
      ],
    });
    // GET 读端点计数并触发限流
    for (let i = 0; i < 3; i++) {
      const r = callMw(
        mw,
        "/internal/portal/apps",
        "10.0.0.1",
        undefined,
        "GET",
      );
      expect(r.nexted).toBe(true);
    }
    const blocked = callMw(
      mw,
      "/internal/portal/apps",
      "10.0.0.1",
      undefined,
      "GET",
    );
    expect(blocked.nexted).toBe(false);
    expect(blocked.status).toBe(429);
    // 写端点不受该规则影响（同一 IP、同一路径前缀）
    const write = callMw(
      mw,
      "/internal/portal/dashboard/publish",
      "10.0.0.1",
      undefined,
      "POST",
    );
    expect(write.nexted).toBe(true);
    // 其他 IP 独立计数
    const otherIp = callMw(
      mw,
      "/internal/portal/apps",
      "10.0.0.2",
      undefined,
      "GET",
    );
    expect(otherIp.nexted).toBe(true);
  });
});

describe("createFixedWindowCounter", () => {
  it("sweeps expired buckets periodically and on demand", () => {
    const counter = createFixedWindowCounter({ sweepInterval: 2 });
    expect(counter.increment("a", 1_000, 0)).toBe(1);
    expect(counter.increment("b", 1_000, 0)).toBe(1);
    // 第 2 次 increment 触发清扫，但此时（nowMs=0）没有过期键
    expect(counter.size()).toBe(2);
    // 时间推进 2s：a 已过期 → 再次使用时重置窗口；b 仍滞留
    expect(counter.increment("a", 1_000, 2_000)).toBe(1);
    // 下一次 increment 触发周期清扫，删除滞留的过期键 b
    expect(counter.increment("c", 1_000, 2_000)).toBe(1);
    expect(counter.size()).toBe(2);
    // 显式清扫：删除全部过期键
    expect(counter.sweepExpired(3_000)).toBe(2);
    expect(counter.size()).toBe(0);
  });

  it("bounds tracked keys at maxBuckets by evicting the oldest bucket", () => {
    const counter = createFixedWindowCounter({
      maxBuckets: 2,
      sweepInterval: 1_000,
    });
    expect(counter.increment("a", 60_000, 0)).toBe(1);
    expect(counter.increment("b", 60_000, 0)).toBe(1);
    expect(counter.size()).toBe(2);
    // 容量已满且无过期键（resetAt=60_000 均未到期）→ 逐出最早过期的键 a
    expect(counter.increment("c", 60_000, 0)).toBe(1);
    expect(counter.size()).toBe(2);
    // a 被逐出后重新计数；仍在窗口内的 c 继续累计
    expect(counter.increment("a", 60_000, 0)).toBe(1);
    expect(counter.increment("c", 60_000, 0)).toBe(2);
    expect(counter.size()).toBe(2);
    // 过期后新键优先复用清扫出的空间（不逐出活动键）
    expect(counter.increment("d", 60_000, 61_000)).toBe(1);
    expect(counter.increment("e", 60_000, 61_000)).toBe(1);
    expect(counter.size()).toBe(2);
  });
});
