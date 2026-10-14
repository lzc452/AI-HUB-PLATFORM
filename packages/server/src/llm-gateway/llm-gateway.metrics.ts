import { Counter, Gauge, Histogram, Registry } from "prom-client";

import type { CircuitState } from "./upstream-circuit-breaker.js";

/**
 * LLM 网关指标（PRD 11.1，`ai_hub_llm_` 前缀）。
 *
 * 独立 Registry（不并进 ObservabilityMetrics）：网关指标由 llm-gateway 模块自管，
 * 由 apps/api 把 registry 合并进 `/internal/metrics` 输出，避免 system/observability
 * 反向依赖业务模块。
 *
 * 采集时查库的两个 gauge（`keys_active` / `keys_quota_critical`）带 TTL 缓存与单飞：
 * Prometheus 15s 抓取一次，但本地调试或双 Prometheus 可能高频触发 scrape，
 * 没有缓存会让每次抓取都跑一次当日聚合查询。
 */

/** 限流拒绝原因（与配额服务三个拒绝点一一对应）。 */
export type RateLimitReason = "rpm" | "tpm" | "daily";

/** 上游自身故障原因（客户端断流不计入——那不是上游的错）。 */
export type UpstreamErrorReason = "timeout" | "http_5xx" | "network";

export interface LlmGatewayMetricsOptions {
  /** 采集时查库：活跃 Key 总数。未提供则该 gauge 恒 0 且不查库。 */
  collectActiveKeyCount?: (() => Promise<number>) | undefined;
  /** 采集时查库：当日用量 ≥90% 日配额的活跃 Key 数（PRD 11.2 配额告警数据源）。 */
  collectQuotaCriticalKeyCount?: (() => Promise<number>) | undefined;
  /** 采集缓存 TTL（毫秒），默认 30_000。 */
  collectCacheTtlMs?: number;
  /** 注入时钟（毫秒），便于测试。 */
  now?: () => number;
}

interface KeyCountSample {
  active: number;
  critical: number;
}

/**
 * 网关组件（守卫/服务/配额/熔断）依赖的指标端口。
 * 服务层只认这个接口，便于测试替身与将来的指标实现替换。
 */
export interface LlmGatewayMetricsPort {
  recordCall(input: {
    durationMs: number;
    endpoint: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    statusCode: number;
  }): void;
  recordRateLimited(reason: RateLimitReason): void;
  recordUpstreamError(reason: UpstreamErrorReason): void;
  setCircuitState(state: CircuitState): void;
  streamStarted(): void;
  streamEnded(): void;
}

const DEFAULT_CACHE_TTL_MS = 30_000;

export class LlmGatewayMetrics {
  public readonly registry = new Registry();

  private readonly requests: Counter<"endpoint" | "model" | "status_code">;
  private readonly duration: Histogram<"endpoint">;
  private readonly tokens: Counter<"model" | "type">;
  private readonly rateLimited: Counter<"reason">;
  private readonly upstreamErrors: Counter<"reason">;
  private readonly circuitState: Gauge<"state">;
  private readonly activeStreams: Gauge;
  private readonly keysActive: Gauge;
  private readonly keysQuotaCritical: Gauge;

  private readonly collectActiveKeyCount: (() => Promise<number>) | undefined;
  private readonly collectQuotaCriticalKeyCount:
    | (() => Promise<number>)
    | undefined;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;

  private sample: KeyCountSample | null = null;
  private sampleAtMs = 0;
  private inFlight: Promise<KeyCountSample> | null = null;

  public constructor(options: LlmGatewayMetricsOptions = {}) {
    this.collectActiveKeyCount = options.collectActiveKeyCount;
    this.collectQuotaCriticalKeyCount = options.collectQuotaCriticalKeyCount;
    this.cacheTtlMs = options.collectCacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;

    const registers = [this.registry];

    this.requests = new Counter({
      help: "LLM 网关请求总数（含被拒请求，PRD 9.2 100% 记账口径）。",
      labelNames: ["endpoint", "model", "status_code"],
      name: "ai_hub_llm_gateway_requests_total",
      registers,
    });
    this.duration = new Histogram({
      help: "LLM 网关请求耗时（秒）。",
      labelNames: ["endpoint"],
      name: "ai_hub_llm_gateway_duration_seconds",
      registers,
    });
    this.tokens = new Counter({
      help: "LLM 网关 token 消耗总数（失败调用不计）。",
      labelNames: ["model", "type"],
      name: "ai_hub_llm_gateway_tokens_total",
      registers,
    });
    this.rateLimited = new Counter({
      help: "LLM 网关限流/配额拒绝总数。",
      labelNames: ["reason"],
      name: "ai_hub_llm_gateway_rate_limited_total",
      registers,
    });
    this.upstreamErrors = new Counter({
      help: "LLM 网关上自身故障总数（超时/网络/5xx；4xx 与 429 不计）。",
      labelNames: ["reason"],
      name: "ai_hub_llm_gateway_upstream_errors_total",
      registers,
    });
    // 熔断状态用「当前状态 1、其余 0」的三标签表示，告警表达式可直接匹配
    // `{state="open"} == 1`，不依赖 gauge 数值到状态的约定。
    this.circuitState = new Gauge({
      help: "LLM 网关上流熔断状态（1 = 当前状态）。",
      labelNames: ["state"],
      name: "ai_hub_llm_gateway_circuit_state",
      registers,
    });
    this.circuitState.set({ state: "closed" }, 1);
    this.circuitState.set({ state: "half_open" }, 0);
    this.circuitState.set({ state: "open" }, 0);
    this.activeStreams = new Gauge({
      help: "LLM 网关进行中的流式请求数。",
      name: "ai_hub_llm_active_streams",
      registers,
    });
    this.keysActive = new Gauge({
      // 必须 await：prom-client 在 metrics() 时等待 async collect 完成，
      // 否则导出的是上一次的值（首次采集时表现为恒 0）
      collect: async () => {
        await this.refreshKeyCounts();
      },
      help: "活跃（未禁用/未撤销）API Key 总数。",
      name: "ai_hub_llm_keys_active",
      registers,
    });
    this.keysQuotaCritical = new Gauge({
      collect: async () => {
        await this.refreshKeyCounts();
      },
      help: "当日用量 ≥90% 日配额的活跃 Key 数（PRD 11.2 配额告警数据源）。",
      name: "ai_hub_llm_keys_quota_critical",
      registers,
    });
  }

  /**
   * 调用记账埋点（与台账 `record()` 同一汇聚点，保证指标与台账口径一致）。
   * token 只在 >0 时计数：失败调用的 token 恒 0，inc 0 只会制造空 series。
   */
  public recordCall(input: {
    durationMs: number;
    endpoint: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    statusCode: number;
  }): void {
    const statusCode = String(input.statusCode);
    this.requests.inc({
      endpoint: input.endpoint,
      model: input.model,
      status_code: statusCode,
    });
    this.duration.observe(
      { endpoint: input.endpoint },
      Math.max(0, input.durationMs) / 1000,
    );
    if (input.promptTokens > 0) {
      this.tokens.inc(
        { model: input.model, type: "prompt" },
        input.promptTokens,
      );
    }
    if (input.completionTokens > 0) {
      this.tokens.inc(
        { model: input.model, type: "completion" },
        input.completionTokens,
      );
    }
  }

  public recordRateLimited(reason: RateLimitReason): void {
    this.rateLimited.inc({ reason });
  }

  public recordUpstreamError(reason: UpstreamErrorReason): void {
    this.upstreamErrors.inc({ reason });
  }

  public setCircuitState(state: CircuitState): void {
    this.circuitState.set({ state: "closed" }, state === "closed" ? 1 : 0);
    this.circuitState.set(
      { state: "half_open" },
      state === "half_open" ? 1 : 0,
    );
    this.circuitState.set({ state: "open" }, state === "open" ? 1 : 0);
  }

  public streamStarted(): void {
    this.activeStreams.inc();
  }

  public streamEnded(): void {
    this.activeStreams.dec();
  }

  /** 测试与运维查询用：当前缓存的 Key 计数快照。 */
  public keyCountSnapshot(): KeyCountSample {
    return this.sample ?? { active: 0, critical: 0 };
  }

  /**
   * 刷新 Key 计数（TTL 缓存 + 单飞）。两个 gauge 的 collect 都走这里，
   * 一次 scrape 内只查一次库；collect 失败时保持上一次的 gauge 值——
   * 采集失败让 Prometheus 看到陈旧值，好过把指标打成 0（那会误触发告警）。
   */
  private refreshKeyCounts(): Promise<KeyCountSample> {
    const nowMs = this.now();
    if (this.sample !== null && nowMs - this.sampleAtMs < this.cacheTtlMs) {
      this.applySample(this.sample);
      return Promise.resolve(this.sample);
    }
    this.inFlight ??= this.loadKeyCounts()
      .catch(() => this.sample ?? { active: 0, critical: 0 })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight.then((sample) => {
      this.applySample(sample);
      return sample;
    });
  }

  private applySample(sample: KeyCountSample): void {
    this.sample = sample;
    this.sampleAtMs = this.now();
    this.keysActive.set(sample.active);
    this.keysQuotaCritical.set(sample.critical);
  }

  private async loadKeyCounts(): Promise<KeyCountSample> {
    const [active, critical] = await Promise.all([
      this.collectActiveKeyCount?.() ?? Promise.resolve(0),
      this.collectQuotaCriticalKeyCount?.() ?? Promise.resolve(0),
    ]);
    const sample = { active, critical };
    this.sample = sample;
    this.sampleAtMs = this.now();
    return sample;
  }
}
