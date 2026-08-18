// rate-limit.middleware.test.ts
import { describe, it, expect } from "vitest";
import { createRateLimitMiddleware } from "./rate-limit.middleware.js";

function callMw(
  mw: (req: unknown, res: unknown, next: () => void) => void,
  path: string,
  ip: string,
  employeeNumber?: string,
) {
  const req = {
    path,
    ip,
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
});
