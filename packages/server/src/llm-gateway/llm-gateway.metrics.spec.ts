import { describe, expect, it } from "vitest";

import { LlmGatewayMetrics } from "./llm-gateway.metrics.js";

/** 从 registry 文本输出里取某个指标的全部行（便于断言 label 组合）。 */
async function linesOf(
  metrics: LlmGatewayMetrics,
  name: string,
): Promise<string[]> {
  const output = await metrics.registry.metrics();
  return output
    .split("\n")
    .filter((line) => line.startsWith(name) && !line.startsWith("#"));
}

describe("LlmGatewayMetrics", () => {
  it("recordCall 累加 requests/duration，token 为 0 时不建 series", async () => {
    const metrics = new LlmGatewayMetrics();
    metrics.recordCall({
      completionTokens: 20,
      durationMs: 1500,
      endpoint: "chat_completions",
      model: "qwen",
      promptTokens: 10,
      statusCode: 200,
    });
    // 失败调用：token 为 0，不应产生 prompt/completion series
    metrics.recordCall({
      completionTokens: 0,
      durationMs: 30,
      endpoint: "chat_completions",
      model: "qwen",
      promptTokens: 0,
      statusCode: 502,
    });

    const output = await metrics.registry.metrics();
    expect(output).toContain(
      'ai_hub_llm_gateway_requests_total{endpoint="chat_completions",model="qwen",status_code="200"} 1',
    );
    expect(output).toContain(
      'ai_hub_llm_gateway_requests_total{endpoint="chat_completions",model="qwen",status_code="502"} 1',
    );
    expect(output).toContain(
      'ai_hub_llm_gateway_tokens_total{model="qwen",type="prompt"} 10',
    );
    expect(output).toContain(
      'ai_hub_llm_gateway_tokens_total{model="qwen",type="completion"} 20',
    );
    expect(output).toContain("ai_hub_llm_gateway_duration_seconds_count");
    // duration 直方图只有 2 次观测
    expect(output).toContain(
      'ai_hub_llm_gateway_duration_seconds_count{endpoint="chat_completions"} 2',
    );
  });

  it("限流与上游错误按 reason 分别计数", async () => {
    const metrics = new LlmGatewayMetrics();
    metrics.recordRateLimited("rpm");
    metrics.recordRateLimited("daily");
    metrics.recordRateLimited("daily");
    metrics.recordUpstreamError("timeout");
    metrics.recordUpstreamError("http_5xx");

    expect(
      await linesOf(metrics, "ai_hub_llm_gateway_rate_limited_total"),
    ).toEqual(
      expect.arrayContaining([
        'ai_hub_llm_gateway_rate_limited_total{reason="daily"} 2',
        'ai_hub_llm_gateway_rate_limited_total{reason="rpm"} 1',
      ]),
    );
    expect(
      await linesOf(metrics, "ai_hub_llm_gateway_upstream_errors_total"),
    ).toEqual(
      expect.arrayContaining([
        'ai_hub_llm_gateway_upstream_errors_total{reason="timeout"} 1',
        'ai_hub_llm_gateway_upstream_errors_total{reason="http_5xx"} 1',
      ]),
    );
  });

  it("熔断状态 gauge 只把当前状态置 1", async () => {
    const metrics = new LlmGatewayMetrics();
    // 初始：closed=1
    expect(await linesOf(metrics, "ai_hub_llm_gateway_circuit_state")).toEqual([
      'ai_hub_llm_gateway_circuit_state{state="closed"} 1',
      'ai_hub_llm_gateway_circuit_state{state="half_open"} 0',
      'ai_hub_llm_gateway_circuit_state{state="open"} 0',
    ]);

    metrics.setCircuitState("open");
    expect(await linesOf(metrics, "ai_hub_llm_gateway_circuit_state")).toEqual([
      'ai_hub_llm_gateway_circuit_state{state="closed"} 0',
      'ai_hub_llm_gateway_circuit_state{state="half_open"} 0',
      'ai_hub_llm_gateway_circuit_state{state="open"} 1',
    ]);

    metrics.setCircuitState("half_open");
    expect(
      await linesOf(metrics, "ai_hub_llm_gateway_circuit_state"),
    ).toContain('ai_hub_llm_gateway_circuit_state{state="half_open"} 1');
  });

  it("活跃流式计数 inc/dec 配对", async () => {
    const metrics = new LlmGatewayMetrics();
    metrics.streamStarted();
    metrics.streamStarted();
    metrics.streamEnded();
    expect(await linesOf(metrics, "ai_hub_llm_active_streams")).toEqual([
      "ai_hub_llm_active_streams 1",
    ]);
  });

  it("keys gauge 采集查库并按 TTL 缓存", async () => {
    let activeCalls = 0;
    let criticalCalls = 0;
    let nowMs = 1_000_000;
    const metrics = new LlmGatewayMetrics({
      collectActiveKeyCount: () => {
        activeCalls += 1;
        return Promise.resolve(7);
      },
      collectCacheTtlMs: 30_000,
      collectQuotaCriticalKeyCount: () => {
        criticalCalls += 1;
        return Promise.resolve(2);
      },
      now: () => nowMs,
    });

    // 首次采集触发查库
    expect(await linesOf(metrics, "ai_hub_llm_keys_active")).toEqual([
      "ai_hub_llm_keys_active 7",
    ]);
    expect(await linesOf(metrics, "ai_hub_llm_keys_quota_critical")).toEqual([
      "ai_hub_llm_keys_quota_critical 2",
    ]);
    expect(activeCalls).toBe(1);
    expect(criticalCalls).toBe(1);

    // TTL 内重复采集不再查库
    await metrics.registry.metrics();
    expect(activeCalls).toBe(1);

    // TTL 过期后重新查库
    nowMs += 31_000;
    await metrics.registry.metrics();
    expect(activeCalls).toBe(2);
  });

  it("采集失败时保留上一次的值，不把 gauge 打成 0", async () => {
    let shouldFail = false;
    let nowMs = 1_000_000;
    const metrics = new LlmGatewayMetrics({
      collectActiveKeyCount: () =>
        shouldFail ? Promise.reject(new Error("db down")) : Promise.resolve(5),
      collectCacheTtlMs: 0,
      collectQuotaCriticalKeyCount: () => Promise.resolve(1),
      now: () => nowMs,
    });

    await metrics.registry.metrics();
    expect(metrics.keyCountSnapshot()).toEqual({ active: 5, critical: 1 });

    shouldFail = true;
    nowMs += 60_000;
    await metrics.registry.metrics();
    // 采集失败：缓存保留旧值（5），而不是被覆盖成 0
    expect(metrics.keyCountSnapshot()).toEqual({ active: 5, critical: 1 });
  });

  it("并发采集单飞：TTL 过期后同时抓取只查一次库", async () => {
    let calls = 0;
    let resolveLoad: ((value: number) => void) | undefined;
    const metrics = new LlmGatewayMetrics({
      collectActiveKeyCount: () => {
        calls += 1;
        return new Promise<number>((resolve) => {
          resolveLoad = resolve;
        });
      },
      collectCacheTtlMs: 0,
      collectQuotaCriticalKeyCount: () => Promise.resolve(0),
    });

    const first = metrics.registry.metrics();
    const second = metrics.registry.metrics();
    resolveLoad?.(3);
    await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(metrics.keyCountSnapshot().active).toBe(3);
  });
});
