import { describe, expect, it, vi } from "vitest";
import type { ApiKeyContext } from "./api-key.guard.js";
import { GatewayApiError } from "./llm-gateway.errors.js";
import { LlmGatewayService } from "./llm-gateway.service.js";
import type { ModelServiceKeyRepository } from "./model-service-key.repository.js";
import type {
  UpstreamResult,
  VllmUpstreamPort,
} from "./vllm-upstream.adapter.js";

const apiKey: ApiKeyContext = {
  keyId: "key-1",
  employeeId: "E100",
  keyPrefix: "sk-aihub-abcdefg",
  limits: { rpm: null, tpm: null, dailyTokens: null },
};

const chatPayload = {
  model: "Qwen3.5 35B A3B",
  messages: [{ role: "user", content: "你好" }],
};

function upstreamWith(
  result: UpstreamResult,
  calls?: { chat?: unknown[] },
): VllmUpstreamPort {
  return {
    async listModels() {
      return result;
    },
    async chatCompletions(payload) {
      calls?.chat?.push(payload);
      return result;
    },
  };
}

function repositoryStub(): ModelServiceKeyRepository & {
  touched: Array<{ keyId: string; at: Date }>;
} {
  const touched: Array<{ keyId: string; at: Date }> = [];
  const notImplemented = (): never => {
    throw new Error("NOT_IMPLEMENTED_IN_TEST");
  };
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

const NOW = new Date("2026-10-13T09:00:00.000Z");

async function expectGatewayError(
  operation: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<GatewayApiError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayApiError);
    const typed = error as GatewayApiError;
    expect(typed.descriptor.code).toBe(code);
    expect(typed.descriptor.status).toBe(status);
    return typed;
  }
  throw new Error(`期望抛出 GatewayApiError(${code})，但调用成功返回`);
}

describe("LlmGatewayService（PRD 8.2 错误映射与透传）", () => {
  it("未配置上游地址时 503 gateway_not_configured", async () => {
    const service = new LlmGatewayService(undefined, repositoryStub());
    await expectGatewayError(
      () => service.listModels(),
      "gateway_not_configured",
      503,
    );
    await expectGatewayError(
      () => service.chatCompletions(chatPayload, apiKey),
      "gateway_not_configured",
      503,
    );
  });

  it("模型列表成功时原样透传上游响应体", async () => {
    const body = {
      object: "list",
      data: [{ id: "Qwen3.5 35B A3B", object: "model", owned_by: "vllm" }],
    };
    const service = new LlmGatewayService(
      upstreamWith({ ok: true, status: 200, body }),
      repositoryStub(),
    );
    await expect(service.listModels()).resolves.toEqual(body);
  });

  it("对话补全成功时原样透传，并更新 last_used_at", async () => {
    const upstreamBody = {
      id: "chatcmpl-1",
      object: "chat.completion",
      model: "Qwen3.5 35B A3B",
      choices: [{ index: 0, message: { role: "assistant", content: "hi" } }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    };
    const calls: unknown[] = [];
    const repository = repositoryStub();
    const service = new LlmGatewayService(
      upstreamWith(
        { ok: true, status: 200, body: upstreamBody },
        { chat: calls },
      ),
      repository,
      () => NOW,
    );

    await expect(service.chatCompletions(chatPayload, apiKey)).resolves.toEqual(
      upstreamBody,
    );
    // 请求体原样转发（不增删字段）
    expect(calls[0]).toEqual(chatPayload);
    expect(repository.touched).toEqual([{ keyId: "key-1", at: NOW }]);
  });

  it("请求体缺 model / messages 时 400 invalid_request_error", async () => {
    const service = new LlmGatewayService(
      upstreamWith({ ok: true, status: 200, body: {} }),
      repositoryStub(),
    );
    await expectGatewayError(
      () => service.chatCompletions({ messages: [{ role: "user" }] }, apiKey),
      "invalid_request_error",
      400,
    );
    await expectGatewayError(
      () => service.chatCompletions({ model: "m", messages: [] }, apiKey),
      "invalid_request_error",
      400,
    );
    await expectGatewayError(
      () => service.chatCompletions({ model: "   ", messages: [{}] }, apiKey),
      "invalid_request_error",
      400,
    );
  });

  it("stream=true 显式拒绝（M3 才开放，避免被当成整段 JSON 静默返回）", async () => {
    const calls: unknown[] = [];
    const service = new LlmGatewayService(
      upstreamWith({ ok: true, status: 200, body: {} }, { chat: calls }),
      repositoryStub(),
    );
    await expectGatewayError(
      () => service.chatCompletions({ ...chatPayload, stream: true }, apiKey),
      "streaming_not_enabled",
      400,
    );
    // 不得把流式请求转发给上游
    expect(calls).toHaveLength(0);
  });

  it("上游 404 → MODEL_NOT_FOUND；429 → UPSTREAM_RATE_LIMITED", async () => {
    const notFound = new LlmGatewayService(
      upstreamWith({
        ok: false,
        kind: "http",
        status: 404,
        body: { error: { message: "model not found" } },
      }),
      repositoryStub(),
    );
    const error = await expectGatewayError(
      () => notFound.chatCompletions(chatPayload, apiKey),
      "model_not_found",
      404,
    );
    expect(error.descriptor.message).toContain("model not found");

    const limited = new LlmGatewayService(
      upstreamWith({ ok: false, kind: "http", status: 429 }),
      repositoryStub(),
    );
    await expectGatewayError(
      () => limited.chatCompletions(chatPayload, apiKey),
      "upstream_rate_limited",
      429,
    );
  });

  it("上游 5xx → 502，超时 → 504，网络不可达 → 502", async () => {
    const serverError = new LlmGatewayService(
      upstreamWith({
        ok: false,
        kind: "http",
        status: 503,
        body: { error: { message: "engine overloaded" } },
      }),
      repositoryStub(),
    );
    const error = await expectGatewayError(
      () => serverError.chatCompletions(chatPayload, apiKey),
      "upstream_error",
      502,
    );
    expect(error.descriptor.message).toContain("engine overloaded");

    const timeout = new LlmGatewayService(
      upstreamWith({ ok: false, kind: "timeout", reason: "timeoutMs=120000" }),
      repositoryStub(),
    );
    const timeoutError = await expectGatewayError(
      () => timeout.chatCompletions(chatPayload, apiKey),
      "upstream_timeout",
      504,
    );
    expect(timeoutError.descriptor.message).toContain("timeoutMs=120000");

    const network = new LlmGatewayService(
      upstreamWith({ ok: false, kind: "network", reason: "ECONNREFUSED" }),
      repositoryStub(),
    );
    const networkError = await expectGatewayError(
      () => network.chatCompletions(chatPayload, apiKey),
      "upstream_error",
      502,
    );
    expect(networkError.descriptor.message).toContain("ECONNREFUSED");
  });

  it("上游 400（含上下文超限）→ 400 并带回上游可读原因", async () => {
    const contextOverflow = new LlmGatewayService(
      upstreamWith({
        ok: false,
        kind: "http",
        status: 400,
        body: {
          error: {
            message:
              "This model's maximum context length is 262144 tokens. However, your messages resulted in 300000 tokens.",
          },
        },
      }),
      repositoryStub(),
    );
    const error = await expectGatewayError(
      () => contextOverflow.chatCompletions(chatPayload, apiKey),
      "invalid_request_error",
      400,
    );
    expect(error.descriptor.message).toContain("262144");
  });

  it("上游超长错误文本被截断，避免把整页内容回显给调用方", async () => {
    const service = new LlmGatewayService(
      upstreamWith({
        ok: false,
        kind: "http",
        status: 500,
        body: { error: { message: "x".repeat(5000) } },
      }),
      repositoryStub(),
    );
    const error = await expectGatewayError(
      () => service.chatCompletions(chatPayload, apiKey),
      "upstream_error",
      502,
    );
    expect(error.descriptor.message.length).toBeLessThan(400);
  });

  it("last_used_at 写入失败不影响转发成功（best-effort）", async () => {
    const repository = repositoryStub();
    vi.spyOn(repository, "touchLastUsedAt").mockRejectedValue(
      new Error("db down"),
    );
    const body = { id: "chatcmpl-1", choices: [] };
    const service = new LlmGatewayService(
      upstreamWith({ ok: true, status: 200, body }),
      repository,
    );
    await expect(service.chatCompletions(chatPayload, apiKey)).resolves.toEqual(
      body,
    );
  });
});
