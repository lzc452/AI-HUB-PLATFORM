import { describe, expect, it } from "vitest";
import {
  API_KEY_AUTH_PATH_PREFIXES,
  createProductionSecurityMiddleware,
} from "./production.middleware.js";

interface Recorded {
  statuses: number[];
  headers: string[];
  next: number;
}

function createHarness(options?: {
  exemptPathPrefixes?: readonly string[];
  onReplayConsume?: () => void;
}) {
  const recorded: Recorded = { statuses: [], headers: [], next: 0 };
  const response = {
    status: (code: number) => {
      recorded.statuses.push(code);
      return response;
    },
    setHeader: (name: string) => {
      recorded.headers.push(name);
      return response;
    },
    json: () => undefined,
  };
  const middleware = createProductionSecurityMiddleware({
    enabled: true,
    expectedOrigin: "https://ai-hub.internal.example",
    replayStore: {
      async consume() {
        options?.onReplayConsume?.();
        return true;
      },
    },
    ...(options?.exemptPathPrefixes === undefined
      ? {}
      : { exemptPathPrefixes: options.exemptPathPrefixes }),
  });
  const run = (request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
  }): Recorded => {
    middleware(
      {
        method: request.method,
        url: request.url,
        headers: request.headers ?? {},
      },
      response,
      () => {
        recorded.next += 1;
      },
    );
    return recorded;
  };
  return { recorded, run };
}

describe("production security middleware", () => {
  it("does not persist an employee identity taken from an untrusted request header", async () => {
    let capturedActor: string | undefined;
    const middleware = createProductionSecurityMiddleware({
      enabled: true,
      expectedOrigin: "https://ai-hub.internal.example",
      replayStore: {
        async consume(input) {
          capturedActor = input.actorEmployeeId;
          return true;
        },
      },
    });
    const response = {
      status: () => response,
      setHeader: () => response,
      json: () => undefined,
    };

    middleware(
      {
        method: "POST",
        url: "/internal/analytics/exports",
        headers: {
          origin: "https://ai-hub.internal.example",
          cookie: "csrf_token=csrf-value",
          "x-csrf-token": "csrf-value",
          "x-request-nonce": "nonce-1234567890",
          "x-request-timestamp": new Date().toISOString(),
          "x-employee-id": "attacker-controlled",
        },
      },
      response,
      () => undefined,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(capturedActor).toBe("authenticated-request");
  });
});

describe("Bearer API Key 端点豁免（/v1）", () => {
  it("豁免清单默认包含 /v1", () => {
    expect(API_KEY_AUTH_PATH_PREFIXES).toContain("/v1");
  });

  it("带 Authorization 头即可通过，不要求 Origin/CSRF/nonce，也不下发 csrf_token", () => {
    let replayConsumed = false;
    const harness = createHarness({
      onReplayConsume: () => {
        replayConsumed = true;
      },
    });

    const recorded = harness.run({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-aihub-test" },
    });

    expect(recorded.next).toBe(1);
    expect(recorded.statuses).toEqual([]);
    expect(recorded.headers).toEqual([]);
    expect(replayConsumed).toBe(false);
  });

  it("查询串不影响豁免判定", () => {
    const harness = createHarness();
    const recorded = harness.run({
      method: "POST",
      url: "/v1/chat/completions?stream=true",
      headers: {},
    });
    expect(recorded.next).toBe(1);
  });

  it("无尾斜杠的 /v1 本身同样豁免", () => {
    const harness = createHarness();
    expect(harness.run({ method: "POST", url: "/v1", headers: {} }).next).toBe(
      1,
    );
  });

  it("不放过形似前缀（/v1-evil）", () => {
    const harness = createHarness();
    const recorded = harness.run({
      method: "POST",
      url: "/v1-evil/chat/completions",
      headers: {},
    });
    expect(recorded.next).toBe(0);
    expect(recorded.statuses).toEqual([403]);
  });

  it("会话端点仍完整执行 CSRF 校验（豁免不外溢）", () => {
    const harness = createHarness();
    const recorded = harness.run({
      method: "POST",
      url: "/internal/analytics/exports",
      headers: {},
    });
    expect(recorded.next).toBe(0);
    expect(recorded.statuses).toEqual([403]);
    expect(recorded.headers).toContain("set-cookie");
  });

  it("显式传空数组即关闭豁免", () => {
    const harness = createHarness({ exemptPathPrefixes: [] });
    const recorded = harness.run({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-aihub-test" },
    });
    expect(recorded.next).toBe(0);
    expect(recorded.statuses).toEqual([403]);
  });

  it("自定义前缀列表覆盖默认值", () => {
    // 每个用例各用一个 harness：next 计数会累加，复用会导致断言基准错位
    const custom = createHarness({ exemptPathPrefixes: ["/openai-proxy/"] });
    expect(
      custom.run({ method: "POST", url: "/openai-proxy/v1/chat", headers: {} })
        .next,
    ).toBe(1);

    const replaced = createHarness({ exemptPathPrefixes: ["/openai-proxy/"] });
    const recorded = replaced.run({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {},
    });
    expect(recorded.next).toBe(0);
    expect(recorded.statuses).toEqual([403]);
  });
});
