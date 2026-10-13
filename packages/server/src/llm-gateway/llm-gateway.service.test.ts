import { describe, expect, it } from "vitest";
import type { ApiKeyContext } from "./api-key.guard.js";
import type {
  CallLogInput,
  LlmCallLogRepository,
} from "./llm-call-log.repository.js";
import { GatewayApiError } from "./llm-gateway.errors.js";
import type { GatewayResponseSink } from "./llm-gateway.sink.js";
import {
  createWeightedFixedWindowCounter,
  LlmQuotaService,
  type QuotaDefaults,
} from "./llm-quota.js";
import { LlmGatewayService } from "./llm-gateway.service.js";
import type { ModelServiceKeyRepository } from "./model-service-key.repository.js";
import { createUpstreamCircuitBreaker } from "./upstream-circuit-breaker.js";
import type {
  UpstreamStreamResult,
  VllmUpstreamPort,
} from "./vllm-upstream.adapter.js";

const apiKey: ApiKeyContext = {
  keyId: "key-1",
  employeeId: "E100",
  keyPrefix: "sk-aihub-abcdefg",
  limits: { rpm: null, tpm: null, dailyTokens: null },
};

const NOW = new Date("2026-10-13T09:00:00.000Z");
const REQUESTS = {
  model: "Qwen3.5 35B A3B",
  messages: [{ role: "user", content: "你好" }],
};
const DEFAULTS: QuotaDefaults = {
  rpm: 60,
  tpm: 100_000,
  dailyTokens: 1_000_000,
};

const CHAT_BODY = {
  id: "chatcmpl-1",
  object: "chat.completion",
  model: "Qwen3.5 35B A3B",
  choices: [{ index: 0, message: { role: "assistant", content: "hi" } }],
  usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
};

// ---------------------------------------------------------------- 桩件

function notImplemented(): never {
  throw new Error("NOT_IMPLEMENTED_IN_TEST");
}

function keyRepositoryStub(): ModelServiceKeyRepository & {
  touched: Array<{ keyId: string; at: Date }>;
} {
  const touched: Array<{ keyId: string; at: Date }> = [];
  return {
    touched,
    async touchLastUsedAt(keyId: string, at: Date) {
      touched.push({ keyId, at });
    },
    insert: notImplemented,
    findById: notImplemented,
    findByHash: notImplemented,
    findByHashes: notImplemented,
    findEmployeeStatus: notImplemented,
    findHoldingByName: notImplemented,
    countHoldingKeys: notImplemented,
    listByEmployee: notImplemented,
    updateAttributes: notImplemented,
    updateStatusCas: notImplemented,
    rotate: notImplemented,
  } as unknown as ModelServiceKeyRepository & {
    touched: Array<{ keyId: string; at: Date }>;
  };
}

function callLogsStub(
  options: { usedTokens?: number; failInsert?: boolean } = {},
): LlmCallLogRepository & { entries: CallLogInput[] } {
  const entries: CallLogInput[] = [];
  return {
    entries,
    async insert(input: CallLogInput) {
      if (options.failInsert === true) throw new Error("db down");
      entries.push(input);
    },
    async sumTokensSince() {
      return options.usedTokens ?? 0;
    },
  };
}

/** 记录写入内容的假 sink；`emitClose` 用于模拟客户端断开。 */
function sinkStub(
  options: { headersAlreadySent?: boolean } = {},
): GatewayResponseSink & {
  headers: Record<string, string>;
  sse: string[];
  ended: boolean;
  jsonResponse?: { status: number; body: unknown } | undefined;
  emitClose: () => void;
  registered: Promise<void>;
} {
  const headers: Record<string, string> = {};
  const sse: string[] = [];
  let closeListener: (() => void) | undefined;
  let markRegistered: () => void = () => undefined;
  const registered = new Promise<void>((resolve) => {
    markRegistered = resolve;
  });
  let sent = options.headersAlreadySent ?? false;
  const sink = {
    headers,
    sse,
    registered,
    ended: false,
    jsonResponse: undefined as { status: number; body: unknown } | undefined,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    flushHeaders() {
      sent = true;
    },
    writeSse(chunk: string) {
      sse.push(chunk);
    },
    end() {
      sink.ended = true;
    },
    json(status: number, body: unknown) {
      sink.jsonResponse = { status, body };
    },
    onClientClose(listener: () => void) {
      closeListener = listener;
      markRegistered();
    },
    headersSent() {
      return sent;
    },
    emitClose() {
      closeListener?.();
    },
  };
  return sink;
}

/** 上游桩：非流式按预设结果返回；流式可注入任意 SSE 流。 */
function upstreamStub(input: {
  json?: unknown;
  failure?: {
    kind: "timeout" | "network" | "http";
    status?: number;
    body?: unknown;
    reason?: string;
  };
  stream?: (args: {
    payload: Record<string, unknown>;
    clientSignal?: AbortSignal | undefined;
  }) => UpstreamStreamResult;
  calls?: { json: unknown[]; stream: unknown[] };
}): VllmUpstreamPort {
  const result = (): unknown => {
    if (input.failure !== undefined) return { ok: false, ...input.failure };
    return { ok: true, status: 200, body: input.json ?? CHAT_BODY };
  };
  return {
    async listModels() {
      return result() as never;
    },
    async chatCompletions(payload) {
      input.calls?.json.push(payload);
      return result() as never;
    },
    async embeddings(payload) {
      input.calls?.json.push(payload);
      return result() as never;
    },
    async chatCompletionsStream(args) {
      input.calls?.stream.push(args.payload);
      if (input.failure !== undefined) return { ok: false, ...input.failure };
      if (input.stream !== undefined) return input.stream(args);
      return {
        ok: true,
        status: 200,
        contentType: "text/event-stream",
        stream: sseStream([
          'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      };
    },
  };
}

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/** 首个数据块后报错的流：用于验证「中途失败」契约。 */
function failingStream(
  chunks: string[],
  error: Error,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      // 注意：`controller.error()` 会清空未读队列，必须等读取方先消费掉已入队的块，
      // 否则「已发出的部分」会凭空消失，测不到真实的中途失败形态。
      setTimeout(() => controller.error(error), 0);
    },
  });
}

/** 永不产出数据的流；仅在 signal abort 时报错（模拟真实被取消的上游请求）。 */
function idleStream(
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener("abort", () => {
        controller.error(
          Object.assign(new Error("aborted"), { name: "AbortError" }),
        );
      });
    },
  });
}

function service(
  input: {
    upstream?: VllmUpstreamPort;
    usedTokens?: number;
    failInsert?: boolean;
    quota?: QuotaDefaults;
    breakerFailures?: number;
    firstTokenTimeoutMs?: number;
  } = {},
) {
  const callLogs = callLogsStub({
    ...(input.usedTokens === undefined ? {} : { usedTokens: input.usedTokens }),
    ...(input.failInsert === undefined ? {} : { failInsert: input.failInsert }),
  });
  const keyRepository = keyRepositoryStub();
  const quota = new LlmQuotaService({
    counters: createWeightedFixedWindowCounter(),
    callLogs,
    defaults: input.quota ?? DEFAULTS,
    now: () => NOW,
  });
  const breaker = createUpstreamCircuitBreaker({
    failureThreshold: input.breakerFailures ?? 5,
    now: () => NOW.getTime(),
  });
  const gateway = new LlmGatewayService({
    upstream: input.upstream,
    keyRepository,
    callLogs,
    quota,
    breaker,
    upstreamTimeoutMs: 5_000,
    firstTokenTimeoutMs: input.firstTokenTimeoutMs ?? 1_000,
    now: () => NOW,
  });
  return { gateway, callLogs, keyRepository, quota, breaker };
}

async function captureGatewayError(
  operation: () => Promise<unknown>,
): Promise<GatewayApiError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayApiError);
    return error as GatewayApiError;
  }
  throw new Error("期望抛出 GatewayApiError，但调用成功返回");
}

// ---------------------------------------------------------------- 用例

describe("LlmGatewayService（非流式）", () => {
  it("未配置上游时 503 gateway_not_configured", async () => {
    const { gateway } = service();
    const error = await captureGatewayError(() => gateway.listModels());
    expect(error.descriptor.code).toBe("gateway_not_configured");
    expect(error.descriptor.status).toBe(503);
  });

  it("模型列表透传上游响应体", async () => {
    const body = { object: "list", data: [] };
    const { gateway } = service({ upstream: upstreamStub({ json: body }) });
    await expect(gateway.listModels()).resolves.toEqual(body);
  });

  it("对话补全：原样透传、写台账（取上游 usage）、结算 TPM、更新 last_used_at", async () => {
    const calls = { json: [] as unknown[], stream: [] as unknown[] };
    const { gateway, callLogs, keyRepository, quota } = service({
      upstream: upstreamStub({ calls }),
    });

    await expect(gateway.chatCompletions(REQUESTS, apiKey)).resolves.toEqual(
      CHAT_BODY,
    );

    expect(calls.json[0]).toEqual(REQUESTS);
    expect(callLogs.entries).toHaveLength(1);
    expect(callLogs.entries[0]).toMatchObject({
      endpoint: "chat_completions",
      model: "Qwen3.5 35B A3B",
      stream: false,
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
      statusCode: 200,
      errorCode: null,
      usageEstimated: false,
    });
    expect(quota.inspect(apiKey).tpm).toBe(7);
    expect(keyRepository.touched).toHaveLength(1);
  });

  it("上游无 usage 时按估算记账并标记 usage_estimated", async () => {
    const body = {
      object: "chat.completion",
      model: "m",
      choices: [{ message: { role: "assistant", content: "x".repeat(400) } }],
    };
    const { gateway, callLogs } = service({
      upstream: upstreamStub({ json: body }),
    });
    await gateway.chatCompletions(REQUESTS, apiKey);
    expect(callLogs.entries[0]?.usageEstimated).toBe(true);
    expect(callLogs.entries[0]?.totalTokens).toBeGreaterThan(0);
  });

  it("embeddings 需要 input，并透传上游", async () => {
    const { gateway } = service({
      upstream: upstreamStub({ json: { data: [] } }),
    });
    const error = await captureGatewayError(() =>
      gateway.embeddings({ model: "m" }, apiKey),
    );
    expect(error.descriptor.status).toBe(400);

    await expect(
      gateway.embeddings({ model: "m", input: "hello" }, apiKey),
    ).resolves.toEqual({ data: [] });
  });

  it("形态非法的请求在触达上游前即返回 400", async () => {
    const calls = { json: [] as unknown[], stream: [] as unknown[] };
    const { gateway } = service({ upstream: upstreamStub({ calls }) });
    const error = await captureGatewayError(() =>
      gateway.chatCompletions({ messages: [] }, apiKey),
    );
    expect(error.descriptor.status).toBe(400);
    expect(calls.json).toHaveLength(0);
  });

  it("stream=true 误走非流式入口时返回 400（入口由控制器分流）", async () => {
    const { gateway } = service({ upstream: upstreamStub({}) });
    const error = await captureGatewayError(() =>
      gateway.chatCompletions({ ...REQUESTS, stream: true }, apiKey),
    );
    expect(error.descriptor.code).toBe("invalid_request_error");
  });

  it("上游失败映射：404/429/5xx/超时/网络，并各自记账", async () => {
    const cases = [
      {
        failure: {
          kind: "http" as const,
          status: 404,
          body: { error: { message: "no model" } },
        },
        code: "model_not_found",
        status: 404,
      },
      {
        failure: { kind: "http" as const, status: 429 },
        code: "upstream_rate_limited",
        status: 429,
      },
      {
        failure: {
          kind: "http" as const,
          status: 503,
          body: { error: { message: "overloaded" } },
        },
        code: "upstream_error",
        status: 502,
      },
      {
        failure: { kind: "timeout" as const, reason: "timeoutMs=5000" },
        code: "upstream_timeout",
        status: 504,
      },
      {
        failure: { kind: "network" as const, reason: "ECONNREFUSED" },
        code: "upstream_error",
        status: 502,
      },
    ];
    for (const item of cases) {
      const { gateway, callLogs } = service({
        upstream: upstreamStub({ failure: item.failure }),
      });
      const error = await captureGatewayError(() =>
        gateway.chatCompletions(REQUESTS, apiKey),
      );
      expect(error.descriptor.code, JSON.stringify(item.failure)).toBe(
        item.code,
      );
      expect(error.descriptor.status).toBe(item.status);
      expect(callLogs.entries[0]).toMatchObject({
        statusCode: item.status,
        errorCode: item.code,
      });
    }
  });

  it("日配额超限返回 429 并带次日零点剩余秒数", async () => {
    const { gateway, callLogs } = service({
      upstream: upstreamStub({}),
      usedTokens: 1_000_000,
    });
    const error = await captureGatewayError(() =>
      gateway.chatCompletions(REQUESTS, apiKey),
    );
    expect(error.descriptor.code).toBe("rate_limit_exceeded");
    expect(error.descriptor.status).toBe(429);
    // NOW = 2026-10-13T09:00Z → 上海 17:00，距次日 00:00（= 16:00Z）为 7 小时
    expect(error.descriptor.retryAfterSeconds).toBe(25_200);
    // 被拒的调用同样留痕（否则「谁在被限流」无从查起）
    expect(callLogs.entries).toHaveLength(1);
    expect(callLogs.entries[0]).toMatchObject({
      statusCode: 429,
      errorCode: "rate_limit_exceeded",
    });
  });

  it("RPM 超限返回 429 且剩余秒数在窗口内", async () => {
    const { gateway } = service({
      upstream: upstreamStub({}),
      quota: { rpm: 2, tpm: 100_000, dailyTokens: 1_000_000 },
    });
    await gateway.chatCompletions(REQUESTS, apiKey);
    await gateway.chatCompletions(REQUESTS, apiKey);
    const error = await captureGatewayError(() =>
      gateway.chatCompletions(REQUESTS, apiKey),
    );
    expect(error.descriptor.code).toBe("rate_limit_exceeded");
    expect(error.descriptor.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("熔断：连续上游故障达到阈值后直接 503，且不再请求上游", async () => {
    const calls = { json: [] as unknown[], stream: [] as unknown[] };
    const { gateway } = service({
      upstream: upstreamStub({
        failure: { kind: "http", status: 500 },
        calls,
      }),
      breakerFailures: 2,
    });
    await captureGatewayError(() => gateway.chatCompletions(REQUESTS, apiKey));
    await captureGatewayError(() => gateway.chatCompletions(REQUESTS, apiKey));
    expect(calls.json).toHaveLength(2);

    const error = await captureGatewayError(() =>
      gateway.chatCompletions(REQUESTS, apiKey),
    );
    expect(error.descriptor.code).toBe("circuit_open");
    expect(error.descriptor.status).toBe(503);
    expect(error.descriptor.retryAfterSeconds).toBe(30);
    // 熔断期间不再触达上游（这正是熔断的目的：不让每个请求都去等超时）
    expect(calls.json).toHaveLength(2);
  });

  it("上游 4xx 不计入熔断失败（请求问题不代表上游不健康）", async () => {
    const { gateway, breaker } = service({
      upstream: upstreamStub({ failure: { kind: "http", status: 404 } }),
      breakerFailures: 1,
    });
    await captureGatewayError(() => gateway.chatCompletions(REQUESTS, apiKey));
    await captureGatewayError(() => gateway.chatCompletions(REQUESTS, apiKey));
    expect(breaker.state()).toBe("closed");
  });

  it("台账写失败不影响已成功的调用", async () => {
    const { gateway } = service({
      upstream: upstreamStub({}),
      failInsert: true,
    });
    await expect(gateway.chatCompletions(REQUESTS, apiKey)).resolves.toEqual(
      CHAT_BODY,
    );
  });
});

describe("LlmGatewayService（流式）", () => {
  it("成功流：设置 SSE 头、原样透传、取末块 usage 记账、[DONE] 透传", async () => {
    const calls = { json: [] as unknown[], stream: [] as unknown[] };
    const { gateway, callLogs, quota, breaker } = service({
      upstream: upstreamStub({
        calls,
        stream: () => ({
          ok: true,
          status: 200,
          contentType: "text/event-stream",
          stream: sseStream([
            'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":4,"total_tokens":13}}\n\n',
            "data: [DONE]\n\n",
          ]),
        }),
      }),
    });
    const sink = sinkStub();

    await gateway.chatCompletionsStream(
      { ...REQUESTS, stream: true },
      apiKey,
      sink,
    );

    expect(sink.headers["content-type"]).toContain("text/event-stream");
    expect(sink.headers["cache-control"]).toBe("no-cache");
    expect(sink.headers["x-accel-buffering"]).toBe("no");
    // 三块原样透传，未额外注入 [DONE]
    expect(sink.sse).toHaveLength(3);
    expect(sink.sse[2]).toBe("data: [DONE]\n\n");
    expect(sink.ended).toBe(true);

    expect(callLogs.entries[0]).toMatchObject({
      stream: true,
      statusCode: 200,
      promptTokens: 9,
      completionTokens: 4,
      totalTokens: 13,
      usageEstimated: false,
    });
    expect(quota.inspect(apiKey).tpm).toBe(13);
    expect(breaker.state()).toBe("closed");
    // 自动注入 include_usage 以便上游把用量带回来
    expect(calls.stream[0]).toMatchObject({
      stream_options: { include_usage: true },
    });
  });

  it("调用方已设置 stream_options 时不覆盖", async () => {
    const calls = { json: [] as unknown[], stream: [] as unknown[] };
    const { gateway } = service({
      upstream: upstreamStub({
        calls,
        stream: () => ({
          ok: true,
          status: 200,
          contentType: "text/event-stream",
          stream: sseStream(["data: [DONE]\n\n"]),
        }),
      }),
    });
    await gateway.chatCompletionsStream(
      { ...REQUESTS, stream: true, stream_options: { include_usage: false } },
      apiKey,
      sinkStub(),
    );
    expect(calls.stream[0]).toMatchObject({
      stream_options: { include_usage: false },
    });
  });

  it("上游不接受流式（非 2xx）时抛错误且未写任何字节", async () => {
    const { gateway } = service({
      upstream: upstreamStub({
        failure: {
          kind: "http",
          status: 404,
          body: { error: { message: "no model" } },
        },
      }),
    });
    const sink = sinkStub();
    const error = await captureGatewayError(() =>
      gateway.chatCompletionsStream(
        { ...REQUESTS, stream: true },
        apiKey,
        sink,
      ),
    );
    expect(error.descriptor.code).toBe("model_not_found");
    expect(sink.sse).toHaveLength(0);
    expect(sink.ended).toBe(false);
  });

  it("首 token 超时：发 SSE error 事件、不发 [DONE]、按 504 记账", async () => {
    const { gateway, callLogs } = service({
      firstTokenTimeoutMs: 20,
      upstream: upstreamStub({
        stream: ({ clientSignal }) => ({
          ok: true,
          status: 200,
          contentType: "text/event-stream",
          stream: idleStream(clientSignal),
        }),
      }),
    });
    const sink = sinkStub();

    await gateway.chatCompletionsStream(
      { ...REQUESTS, stream: true },
      apiKey,
      sink,
    );

    const joined = sink.sse.join("");
    expect(joined).toContain('"code":"upstream_timeout"');
    expect(joined).not.toContain("[DONE]");
    expect(sink.ended).toBe(true);
    expect(callLogs.entries[0]).toMatchObject({
      statusCode: 504,
      errorCode: "upstream_timeout",
    });
  });

  it("中途失败：已发的块保留，追加 error 事件且不发 [DONE]", async () => {
    const { gateway, callLogs } = service({
      upstream: upstreamStub({
        stream: () => ({
          ok: true,
          status: 200,
          contentType: "text/event-stream",
          stream: failingStream(
            ['data: {"choices":[{"delta":{"content":"半"}}]}\n\n'],
            new Error("upstream connection reset"),
          ),
        }),
      }),
    });
    const sink = sinkStub();

    await gateway.chatCompletionsStream(
      { ...REQUESTS, stream: true },
      apiKey,
      sink,
    );

    expect(sink.sse[0]).toContain('"content":"半"');
    expect(sink.sse[1]).toContain('"code":"upstream_error"');
    expect(sink.sse.join("")).not.toContain("[DONE]");
    expect(callLogs.entries[0]).toMatchObject({
      statusCode: 502,
      errorCode: "upstream_error",
    });
  });

  it("客户端断流：取消上游并记为 client_disconnected（不写 error 事件）", async () => {
    const { gateway, callLogs } = service({
      upstream: upstreamStub({
        stream: ({ clientSignal }) => ({
          ok: true,
          status: 200,
          contentType: "text/event-stream",
          stream: idleStream(clientSignal),
        }),
      }),
    });
    const sink = sinkStub();
    const pending = gateway.chatCompletionsStream(
      { ...REQUESTS, stream: true },
      apiKey,
      sink,
    );
    // 等服务的断开监听器注册完成（其在配额判定之后），再模拟客户端断开
    await sink.registered;
    sink.emitClose();
    await pending;

    expect(sink.sse.join("")).not.toContain('"error"');
    expect(sink.ended).toBe(true);
    expect(callLogs.entries[0]).toMatchObject({
      statusCode: 499,
      errorCode: "client_disconnected",
    });
  });

  it("流式也无 usage 时用估算兜底并标记", async () => {
    const { gateway, callLogs } = service({
      upstream: upstreamStub({
        stream: () => ({
          ok: true,
          status: 200,
          contentType: "text/event-stream",
          stream: sseStream([
            `data: {"choices":[{"delta":{"content":"${"x".repeat(200)}"}}]}\n\n`,
            "data: [DONE]\n\n",
          ]),
        }),
      }),
    });
    await gateway.chatCompletionsStream(
      { ...REQUESTS, stream: true },
      apiKey,
      sinkStub(),
    );
    expect(callLogs.entries[0]?.usageEstimated).toBe(true);
    expect(callLogs.entries[0]?.totalTokens).toBeGreaterThan(0);
  });

  it("配额超限在写头之前判定：抛 429 且未发任何 SSE", async () => {
    const { gateway } = service({
      upstream: upstreamStub({}),
      usedTokens: 1_000_000,
    });
    const sink = sinkStub();
    const error = await captureGatewayError(() =>
      gateway.chatCompletionsStream(
        { ...REQUESTS, stream: true },
        apiKey,
        sink,
      ),
    );
    expect(error.descriptor.status).toBe(429);
    expect(sink.sse).toHaveLength(0);
    expect(sink.headersSent()).toBe(false);
  });
});
