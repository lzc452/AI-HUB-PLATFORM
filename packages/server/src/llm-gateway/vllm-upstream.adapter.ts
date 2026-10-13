import { randomUUID } from "node:crypto";

/**
 * vLLM 上游适配器（PRD 7.2 `vllm-upstream.adapter`）。
 *
 * ## 两条不可让步的原则
 *
 * 1. **不向上游转发任何客户端请求头**——尤其是 `Authorization`。上游是本平台内部的
 *    推理服务，平台 API Key 只是「调用方 → 平台」的凭据，泄露给上游属于凭据越权扩散。
 *    这里只发必要头（`content-type`）与用于排障关联的 `x-request-id`。
 * 2. **失败必须分类**，而不是统统变成 500：超时、网络不可达、上游 HTTP 错误在用户侧
 *    对应三条不同的处置（重试/等待/换模型），分类错了用户就会做错决策。
 *
 * 适配器只做「发请求 + 分类结果」，不产出 OpenAI 信封——那是服务层与过滤器的职责。
 */

export type UpstreamFailureKind = "timeout" | "network" | "http";

export type UpstreamResult =
  | { ok: true; status: number; body: unknown }
  | {
      ok: false;
      kind: UpstreamFailureKind;
      status?: number;
      body?: unknown;
      reason?: string;
    };

export interface VllmUpstreamPort {
  listModels(): Promise<UpstreamResult>;
  chatCompletions(payload: Record<string, unknown>): Promise<UpstreamResult>;
}

export interface VllmUpstreamOptions {
  /** OpenAI 兼容基址，例如 `http://10.10.181.82:3040/v1`（容忍尾部斜杠）。 */
  baseUrl: string;
  /** 整体超时（毫秒）。首 token 超时属流式阶段（M3）。 */
  timeoutMs: number;
  /** 注入 fetch 以便测试（默认用全局 fetch）。 */
  fetchImpl?: typeof fetch;
}

/** 安全解析响应体：非 JSON 时保留原始文本，便于诊断且不抛错。 */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createVllmUpstream(
  options: VllmUpstreamOptions,
): VllmUpstreamPort {
  const base = options.baseUrl.replace(/\/+$/u, "");
  const doFetch = options.fetchImpl ?? fetch;

  async function post(
    path: string,
    init: { method: "GET" | "POST"; payload?: Record<string, unknown> },
  ): Promise<UpstreamResult> {
    const requestId = randomUUID();
    try {
      const response = await doFetch(`${base}${path}`, {
        method: init.method,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        ...(init.payload === undefined
          ? {}
          : { body: JSON.stringify(init.payload) }),
        // AbortSignal.timeout 到期抛 TimeoutError（见下方 catch 分类）
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      const body = await readBody(response);
      if (response.ok) {
        return { ok: true, status: response.status, body };
      }
      return {
        ok: false,
        kind: "http",
        status: response.status,
        ...(body === undefined ? {} : { body }),
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error ? error.message : String(error);
      if (name === "TimeoutError" || name === "AbortError") {
        return {
          ok: false,
          kind: "timeout",
          reason: `timeoutMs=${options.timeoutMs}`,
        };
      }
      return { ok: false, kind: "network", reason: message };
    }
  }

  return {
    listModels: () => post("/models", { method: "GET" }),
    chatCompletions: (payload) =>
      post("/chat/completions", { method: "POST", payload }),
  };
}
