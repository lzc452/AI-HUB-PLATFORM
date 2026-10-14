import type { Logger } from "pino";
import { getTraceId } from "../system/observability/request-context.middleware.js";
import type { ApiKeyContext } from "./api-key.guard.js";
import {
  GatewayApiError,
  gatewayError,
  summarizeUpstreamDetail,
} from "./llm-gateway.errors.js";
import type { GatewayResponseSink } from "./llm-gateway.sink.js";
import type {
  CallLogInput,
  LlmCallEndpoint,
  LlmCallLogRepository,
} from "./llm-call-log.repository.js";
import type { LlmQuotaService } from "./llm-quota.js";
import type { ModelServiceKeyRepository } from "./model-service-key.repository.js";
import type { UpstreamCircuitBreaker } from "./upstream-circuit-breaker.js";
import type {
  LlmGatewayMetricsPort,
  UpstreamErrorReason,
} from "./llm-gateway.metrics.js";
import type {
  UpstreamResult,
  UpstreamStreamResult,
  VllmUpstreamPort,
} from "./vllm-upstream.adapter.js";
import {
  estimateUsage,
  extractCompletionDelta,
  extractSseUsage,
  fromUpstreamUsage,
  normalizeModelName,
  type UsageNumbers,
} from "./llm-usage.js";

/**
 * 网关面服务（PRD 7.2 / 8.2 / 9.4）。
 *
 * 请求生命周期（成功路径）：
 *
 * ```
 * 形态校验 → 配额预检（日配额→RPM→TPM）→ 熔断放行 → 转发上游
 *   ├─ 非流式：解析 usage → 记账 → TPM 结算 → 原样返回响应
 *   └─ 流式  ：透传 SSE → 末块 usage（或估算）→ 记账 → TPM 结算
 * ```
 *
 * 三条贯穿全类的原则：
 * 1. **成功响应原样透传**（不增删字段），只在旁边读取自己需要的 usage/model；
 * 2. **失败一律翻译成网关错误**，并且**100% 记账**——被拒的调用也要留痕，
 *    否则「谁在被限流、谁在报错」无从查起；
 * 3. **记账是旁路**：写台账失败不能让已经成功的调用变成失败，只记日志（M5 由指标观测）。
 */
export interface LlmGatewayServiceOptions {
  /** 未配置上游地址时为 undefined（`/v1` 一律 503）。 */
  upstream: VllmUpstreamPort | undefined;
  keyRepository: ModelServiceKeyRepository;
  callLogs: LlmCallLogRepository;
  quota: LlmQuotaService;
  breaker: UpstreamCircuitBreaker;
  upstreamTimeoutMs: number;
  firstTokenTimeoutMs: number;
  now?: () => Date;
  /** M5 指标埋点（PRD 11.1）；未提供则静默（测试与不部署监控的环境）。 */
  metrics?: LlmGatewayMetricsPort | undefined;
  /** 台账写失败等旁路问题的出口；未提供则静默。 */
  logger?: Logger | undefined;
}

/** 客户端断流的记账状态：沿用 HTTP 499 语义（非标准码，仅台账内表示）。 */
const CLIENT_DISCONNECTED_STATUS = 499;
const CLIENT_DISCONNECTED_CODE = "client_disconnected";

export class LlmGatewayService {
  private readonly upstream: VllmUpstreamPort | undefined;
  private readonly keyRepository: ModelServiceKeyRepository;
  private readonly callLogs: LlmCallLogRepository;
  private readonly quota: LlmQuotaService;
  private readonly breaker: UpstreamCircuitBreaker;
  private readonly upstreamTimeoutMs: number;
  private readonly firstTokenTimeoutMs: number;
  private readonly now: () => Date;
  private readonly metrics: LlmGatewayMetricsPort | undefined;
  private readonly logger: Logger | undefined;

  public constructor(options: LlmGatewayServiceOptions) {
    this.upstream = options.upstream;
    this.keyRepository = options.keyRepository;
    this.callLogs = options.callLogs;
    this.quota = options.quota;
    this.breaker = options.breaker;
    this.upstreamTimeoutMs = options.upstreamTimeoutMs;
    this.firstTokenTimeoutMs = options.firstTokenTimeoutMs;
    this.now = options.now ?? (() => new Date());
    this.metrics = options.metrics;
    this.logger = options.logger;
  }

  // ---- 模型列表 ---------------------------------------------------------

  public async listModels(): Promise<unknown> {
    const result = await this.requireUpstream().listModels();
    if (!result.ok) throw this.toGatewayError(result);
    return result.body;
  }

  // ---- 对话补全（非流式）------------------------------------------------

  public async chatCompletions(
    payload: Record<string, unknown>,
    apiKey: ApiKeyContext,
  ): Promise<unknown> {
    this.assertChatPayload(payload);
    if (payload["stream"] === true) {
      // 控制器会先分流到流式方法；走到这里说明入口用错了
      throw gatewayError("INVALID_REQUEST", {
        detail: "stream 请求必须走流式分支",
      });
    }
    return this.forwardJson({ payload, apiKey, endpoint: "chat_completions" });
  }

  // ---- 向量化 -----------------------------------------------------------

  public async embeddings(
    payload: Record<string, unknown>,
    apiKey: ApiKeyContext,
  ): Promise<unknown> {
    this.assertModel(payload);
    if (payload["input"] === undefined) {
      throw gatewayError("INVALID_REQUEST", { detail: "缺少 input 字段" });
    }
    return this.forwardJson({ payload, apiKey, endpoint: "embeddings" });
  }

  // ---- 对话补全（流式 SSE）---------------------------------------------

  public async chatCompletionsStream(
    payload: Record<string, unknown>,
    apiKey: ApiKeyContext,
    sink: GatewayResponseSink,
  ): Promise<void> {
    this.assertChatPayload(payload);
    const startedAt = this.now();
    const startedMs = startedAt.getTime();
    const model = normalizeModelName({ requestModel: payload["model"] });
    const promptEstimate = estimateUsage({
      requestPayload: payload,
      completionText: "",
    });

    // 配额与熔断都在写出任何字节之前判定：失败仍能以正确状态码 + JSON 信封返回，
    // 且失败同样写入台账（否则「谁在被限流/被熔断挡住」无从查起）
    await this.assertAdmissible({
      apiKey,
      endpoint: "chat_completions",
      model,
      stream: true,
      startedAt,
      estimatedTokens: promptEstimate.totalTokens,
    });

    const controller = new AbortController();
    let clientClosed = false;
    let firstTokenTimedOut = false;
    sink.onClientClose(() => {
      clientClosed = true;
      controller.abort();
    });

    const open = await this.requireUpstream().chatCompletionsStream({
      payload: this.withUsageInjection(payload),
      overallTimeoutMs: this.upstreamTimeoutMs,
      clientSignal: controller.signal,
    });

    if (!open.ok) {
      this.breaker.onFailure();
      this.metrics?.recordUpstreamError(upstreamErrorReasonOf(open));
      await this.record({
        apiKey,
        endpoint: "chat_completions",
        model,
        stream: true,
        usage: emptyUsage(),
        durationMs: this.now().getTime() - startedMs,
        statusCode: this.statusOf(open),
        errorCode: this.errorCodeOf(open),
        requestedAt: startedAt,
      });
      throw this.toGatewayError(open);
    }

    // 上游接受后才发头：此后状态码已定，错误只能以 SSE 事件表达
    sink.setHeader("content-type", "text/event-stream; charset=utf-8");
    sink.setHeader("cache-control", "no-cache");
    sink.setHeader("connection", "keep-alive");
    // 纵深防御：即便 nginx 未配 proxy_buffering off，也提示它不要缓冲
    sink.setHeader("x-accel-buffering", "no");
    sink.flushHeaders();
    // 发头之后才计入「进行中的流式请求」：此前失败的请求没有流可计。
    // 释放点在下方的 finally（透传循环结束时流即结束，无需等 record/settle）。
    this.metrics?.streamStarted();

    let firstTokenTimer: NodeJS.Timeout | undefined = setTimeout(() => {
      firstTokenTimedOut = true;
      controller.abort();
    }, this.firstTokenTimeoutMs);

    let usage: UsageNumbers | null = null;
    let completionText = "";
    let sawDone = false;
    let failure: { statusCode: number; errorCode: string } | null = null;
    const decoder = new TextDecoder();
    let pending = "";

    try {
      const reader = open.stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (firstTokenTimer !== undefined) {
          clearTimeout(firstTokenTimer);
          firstTokenTimer = undefined;
        }
        const text = decoder.decode(value, { stream: true });
        // 原样透传：SSE 框架（`data:` 与空行）由上游给出，网关不改写
        sink.writeSse(text);

        pending += text;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const dataLine = line.slice(5).trim();
          if (dataLine === "[DONE]") {
            sawDone = true;
            continue;
          }
          const chunkUsage = extractSseUsage(dataLine);
          if (chunkUsage !== null) usage = chunkUsage;
          completionText += extractCompletionDelta(dataLine);
        }
      }
    } catch (error) {
      if (clientClosed) {
        failure = {
          statusCode: CLIENT_DISCONNECTED_STATUS,
          errorCode: CLIENT_DISCONNECTED_CODE,
        };
      } else {
        const descriptor = firstTokenTimedOut
          ? gatewayError("UPSTREAM_TIMEOUT", {
              detail: `first token timeout: ${this.firstTokenTimeoutMs}ms`,
            }).descriptor
          : gatewayError("UPSTREAM_ERROR", {
              detail: error instanceof Error ? error.message : String(error),
            }).descriptor;
        failure = {
          statusCode: descriptor.status,
          errorCode: descriptor.code,
        };
        this.breaker.onFailure();
        // 流已建立后的中断：首 token 超时归 timeout，其余（连接重置/上游关闭）归 network
        this.metrics?.recordUpstreamError(
          firstTokenTimedOut ? "timeout" : "network",
        );
        // 已发头：以 SSE `error` 事件收尾，且**不发 [DONE]**，调用方据此判定异常结束
        sink.writeSse(
          `data: ${JSON.stringify({
            error: {
              message: descriptor.message,
              type: descriptor.type,
              param: null,
              code: descriptor.code,
            },
          })}\n\n`,
        );
      }
    } finally {
      if (firstTokenTimer !== undefined) clearTimeout(firstTokenTimer);
      // 与发头处的 streamStarted 配对：透传循环结束（含异常/断流）即释放。
      // record 与 settle 不在此 finally——它们属于收尾，不属于流式传输本身。
      this.metrics?.streamEnded();
    }

    if (failure === null && clientClosed) {
      failure = {
        statusCode: CLIENT_DISCONNECTED_STATUS,
        errorCode: CLIENT_DISCONNECTED_CODE,
      };
    } else if (failure === null && !sawDone) {
      // 上游正常结束但没给过 [DONE]：补发，保证官方 SDK 能正常收流结束
      sink.writeSse("data: [DONE]\n\n");
    }
    sink.end();

    const resolvedUsage =
      usage ?? estimateUsage({ requestPayload: payload, completionText });
    if (failure === null) this.breaker.onSuccess();
    await this.record({
      apiKey,
      endpoint: "chat_completions",
      model,
      stream: true,
      usage: failure === null ? resolvedUsage : emptyUsage(),
      durationMs: this.now().getTime() - startedMs,
      statusCode: failure?.statusCode ?? 200,
      errorCode: failure?.errorCode ?? null,
      requestedAt: startedAt,
    });
    this.quota.settle(apiKey, failure === null ? resolvedUsage.totalTokens : 0);
  }

  // ---- 内部：非流式转发 -------------------------------------------------

  private async forwardJson(input: {
    payload: Record<string, unknown>;
    apiKey: ApiKeyContext;
    endpoint: LlmCallEndpoint;
  }): Promise<unknown> {
    const startedAt = this.now();
    const startedMs = startedAt.getTime();
    const model = normalizeModelName({ requestModel: input.payload["model"] });
    const promptEstimate = estimateUsage({
      requestPayload: input.payload,
      completionText: "",
    });

    await this.assertAdmissible({
      apiKey: input.apiKey,
      endpoint: input.endpoint,
      model,
      stream: false,
      startedAt,
      estimatedTokens: promptEstimate.totalTokens,
    });

    const upstream = this.requireUpstream();
    const result =
      input.endpoint === "embeddings"
        ? await upstream.embeddings(input.payload)
        : await upstream.chatCompletions(input.payload);

    if (!result.ok) {
      if (isUpstreamFault(result)) {
        this.breaker.onFailure();
        this.metrics?.recordUpstreamError(upstreamErrorReasonOf(result));
      }
      await this.record({
        apiKey: input.apiKey,
        endpoint: input.endpoint,
        model,
        stream: false,
        usage: emptyUsage(),
        durationMs: this.now().getTime() - startedMs,
        statusCode: this.statusOf(result),
        errorCode: this.errorCodeOf(result),
        requestedAt: startedAt,
      });
      throw this.toGatewayError(result);
    }

    this.breaker.onSuccess();
    const body = result.body;
    const usage =
      fromUpstreamUsage(body) ??
      estimateUsage({
        requestPayload: input.payload,
        completionText: completionTextOf(body),
      });
    await this.record({
      apiKey: input.apiKey,
      endpoint: input.endpoint,
      model: normalizeModelName({
        responseModel: (body as { model?: unknown } | null)?.model,
        requestModel: input.payload["model"],
      }),
      stream: false,
      usage,
      durationMs: this.now().getTime() - startedMs,
      statusCode: 200,
      errorCode: null,
      requestedAt: startedAt,
    });
    this.quota.settle(input.apiKey, usage.totalTokens);

    // 「最近一次成功调用」是 Key 的展示字段；台账已由上面写入
    try {
      await this.keyRepository.touchLastUsedAt(input.apiKey.keyId, this.now());
    } catch (error) {
      this.warn(error, "更新 Key 最近使用时间失败");
    }
    return body;
  }

  // ---- 内部：公共部件 ---------------------------------------------------

  /**
   * 准入判定（配额 + 熔断）。被拒时**先记账再抛出**——
   * PRD 12 的「任一步失败即拒绝并记账」是对账与排障的前提。
   */
  private async assertAdmissible(input: {
    apiKey: ApiKeyContext;
    endpoint: LlmCallEndpoint;
    model: string;
    stream: boolean;
    startedAt: Date;
    estimatedTokens: number;
  }): Promise<void> {
    try {
      await this.quota.assertWithinQuota(input.apiKey, input.estimatedTokens);
      this.assertBreakerAllows();
    } catch (error) {
      const descriptor =
        error instanceof GatewayApiError ? error.descriptor : null;
      await this.record({
        apiKey: input.apiKey,
        endpoint: input.endpoint,
        model: input.model,
        stream: input.stream,
        usage: emptyUsage(),
        durationMs: this.now().getTime() - input.startedAt.getTime(),
        statusCode: descriptor?.status ?? 500,
        errorCode: descriptor?.code ?? "internal_error",
        requestedAt: input.startedAt,
      });
      throw error;
    }
  }

  private requireUpstream(): VllmUpstreamPort {
    if (this.upstream === undefined) {
      throw gatewayError("NOT_CONFIGURED");
    }
    return this.upstream;
  }

  private assertBreakerAllows(): void {
    if (this.breaker.allow()) return;
    throw gatewayError("CIRCUIT_OPEN", {
      retryAfterSeconds: this.breaker.retryAfterSeconds(),
    });
  }

  private assertModel(payload: Record<string, unknown>): void {
    const model = payload["model"];
    if (typeof model !== "string" || model.trim() === "") {
      throw gatewayError("INVALID_REQUEST", { detail: "缺少 model 字段" });
    }
  }

  /**
   * 最小形态校验：只拦「一定是坏请求」的情况，其余交给上游判定，
   * 避免与 OpenAI 的 schema 漂移，也避免把上游能处理的请求提前拒掉。
   */
  private assertChatPayload(payload: Record<string, unknown>): void {
    this.assertModel(payload);
    const messages = payload["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      throw gatewayError("INVALID_REQUEST", {
        detail: "messages 必须是非空数组",
      });
    }
  }

  /**
   * 自动注入 `stream_options.include_usage`（评审 R1-08）：
   * 流式默认不返回 usage，不注入则 token 记账恒为 0，用量与配额双双失准。
   * 调用方显式设置过则尊重其选择（不覆盖）。
   */
  private withUsageInjection(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const existing = payload["stream_options"];
    if (typeof existing === "object" && existing !== null) return payload;
    return { ...payload, stream_options: { include_usage: true } };
  }

  /** 上游失败 → 网关错误（PRD 8.2 错误表）。 */
  private toGatewayError(result: {
    kind: "timeout" | "network" | "http" | "client_aborted";
    status?: number;
    body?: unknown;
    reason?: string;
  }) {
    const detail = summarizeUpstreamDetail(result.body);
    if (result.kind === "timeout") {
      return gatewayError("UPSTREAM_TIMEOUT", {
        detail: result.reason ?? undefined,
      });
    }
    if (result.kind === "network") {
      return gatewayError("UPSTREAM_ERROR", {
        message: "模型服务不可达",
        detail: result.reason ?? undefined,
      });
    }
    if (result.kind === "client_aborted") {
      return gatewayError("UPSTREAM_ERROR", {
        message: "客户端已断开",
        detail: result.reason ?? undefined,
      });
    }
    const status = result.status ?? 502;
    if (status === 404) return gatewayError("MODEL_NOT_FOUND", { detail });
    if (status === 429)
      return gatewayError("UPSTREAM_RATE_LIMITED", { detail });
    if (status >= 500) {
      return gatewayError("UPSTREAM_ERROR", {
        detail: `上游 ${status}${detail === "" ? "" : ` ${detail}`}`,
      });
    }
    return gatewayError("INVALID_REQUEST", { detail });
  }

  private statusOf(result: UpstreamResult | UpstreamStreamResult): number {
    if (result.ok) return result.status;
    return this.toGatewayError(result).descriptor.status;
  }

  private errorCodeOf(result: UpstreamResult | UpstreamStreamResult): string {
    if (result.ok) return "";
    return this.toGatewayError(result).descriptor.code;
  }

  private async record(input: {
    apiKey: ApiKeyContext;
    endpoint: LlmCallEndpoint;
    model: string;
    stream: boolean;
    usage: UsageNumbers;
    durationMs: number;
    statusCode: number;
    errorCode: string | null;
    requestedAt: Date;
  }): Promise<void> {
    // 指标与台账同一汇聚点（PRD 11.1 与 9.2 口径一致）；指标先记，
    // 台账是旁路（失败只警告），不能让台账失败连带丢掉指标。
    this.metrics?.recordCall({
      durationMs: input.durationMs,
      endpoint: input.endpoint,
      model: input.model,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      statusCode: input.statusCode,
    });
    const entry: CallLogInput = {
      keyId: input.apiKey.keyId,
      employeeId: input.apiKey.employeeId,
      endpoint: input.endpoint,
      model: input.model,
      stream: input.stream,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
      durationMs: Math.max(0, input.durationMs),
      statusCode: input.statusCode,
      errorCode: input.errorCode,
      usageEstimated: input.usage.estimated,
      traceId: safeTraceId(),
      requestedAt: input.requestedAt,
    };
    try {
      await this.callLogs.insert(entry);
    } catch (error) {
      this.warn(error, "写入模型调用台账失败");
    }
  }

  private warn(error: unknown, message: string): void {
    this.logger?.warn(
      {
        traceId: safeTraceId(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      message,
    );
  }
}

function emptyUsage(): UsageNumbers {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimated: false,
  };
}

/** 只把「上游自身故障」计为熔断失败：4xx 与 429 是请求或节流问题，不代表上游不健康。 */
function isUpstreamFault(
  result: Extract<UpstreamResult, { ok: false }>,
): boolean {
  if (result.kind === "timeout" || result.kind === "network") return true;
  if (result.kind !== "http") return false;
  const status = result.status ?? 0;
  return status >= 500;
}

/** 上游故障 → 指标 reason（PRD 11.1 `upstream_errors_total`）。调用方需先过 isUpstreamFault。 */
function upstreamErrorReasonOf(result: {
  kind: string;
  status?: number;
}): UpstreamErrorReason {
  if (result.kind === "timeout") return "timeout";
  if (result.kind === "network") return "network";
  return "http_5xx";
}

function completionTextOf(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  return choices
    .map((choice) =>
      typeof choice === "object" && choice !== null
        ? ((choice as { message?: { content?: unknown } }).message?.content ??
          "")
        : "",
    )
    .filter((content): content is string => typeof content === "string")
    .join("");
}

function safeTraceId(): string | null {
  try {
    return getTraceId();
  } catch {
    return null;
  }
}
