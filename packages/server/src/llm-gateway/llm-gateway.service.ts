import type { ApiKeyContext } from "./api-key.guard.js";
import { gatewayError, summarizeUpstreamDetail } from "./llm-gateway.errors.js";
import type { ModelServiceKeyRepository } from "./model-service-key.repository.js";
import type {
  UpstreamResult,
  VllmUpstreamPort,
} from "./vllm-upstream.adapter.js";

/**
 * 网关面服务（PRD 7.2 `llm-gateway.service`）。
 *
 * 职责边界很窄：**校验最小请求形态 → 调上游 → 把上游失败翻译成网关错误 → 透传成功响应**。
 * 它不做 OpenAI 报文校验（`messages` 的完整 schema 由上游负责），也不改写报文——
 * 平台此前踩过的坑正是「中间层自作主张改请求体」（PRD 8.3 R3-03：全局 whitelist 会剔除
 * 未声明字段），因此这里对成功响应采取**原样透传**，只读取自己需要的字段。
 */
export class LlmGatewayService {
  public constructor(
    /** 未配置上游地址时为 undefined（`/v1` 一律 503）。 */
    private readonly upstream: VllmUpstreamPort | undefined,
    private readonly repository: ModelServiceKeyRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async listModels(): Promise<unknown> {
    const result = await this.requireUpstream().listModels();
    return this.unwrap(result).body;
  }

  public async chatCompletions(
    payload: Record<string, unknown>,
    apiKey: ApiKeyContext,
  ): Promise<unknown> {
    this.assertChatPayload(payload);
    if (payload["stream"] === true) {
      // M3 才做 SSE 透传：在此之前若放行，适配器会把整段 SSE 读成 JSON 字符串返回 200，
      // 调用方拿到一个无法解析的「成功」响应——显式拒绝比静默出错好。
      throw gatewayError("STREAMING_NOT_ENABLED");
    }
    const result = await this.requireUpstream().chatCompletions(payload);
    const successful = this.unwrap(result);

    // 「最近一次成功调用」是 Key 的展示字段，写失败不影响本次转发结果
    try {
      await this.repository.touchLastUsedAt(apiKey.keyId, this.now());
    } catch {
      // 静默：审计与计量的完整落库属于 M4（llm_api_call_logs），这里只维护展示字段
    }
    return successful.body;
  }

  private requireUpstream(): VllmUpstreamPort {
    if (this.upstream === undefined) {
      throw gatewayError("NOT_CONFIGURED");
    }
    return this.upstream;
  }

  /**
   * 最小形态校验：只拦「一定是坏请求」的情况，其余交给上游判定。
   * 这样既不与 OpenAI 的 schema 漂移，也不会把上游能处理的请求提前拒掉。
   */
  private assertChatPayload(payload: Record<string, unknown>): void {
    const model = payload["model"];
    if (typeof model !== "string" || model.trim() === "") {
      throw gatewayError("INVALID_REQUEST", { detail: "缺少 model 字段" });
    }
    const messages = payload["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      throw gatewayError("INVALID_REQUEST", {
        detail: "messages 必须是非空数组",
      });
    }
  }

  /** 上游结果 → 成功响应体 或 网关错误（PRD 8.2 错误表）。 */
  private unwrap(result: UpstreamResult): { body: unknown } {
    if (result.ok) {
      return { body: result.body };
    }
    const detail = summarizeUpstreamDetail(result.body);
    if (result.kind === "timeout") {
      throw gatewayError("UPSTREAM_TIMEOUT", {
        detail: result.reason ?? undefined,
      });
    }
    if (result.kind === "network") {
      throw gatewayError("UPSTREAM_ERROR", {
        message: "模型服务不可达",
        detail: result.reason ?? undefined,
      });
    }

    const status = result.status ?? 502;
    if (status === 404) {
      throw gatewayError("MODEL_NOT_FOUND", { detail });
    }
    if (status === 429) {
      throw gatewayError("UPSTREAM_RATE_LIMITED", { detail });
    }
    if (status >= 500) {
      throw gatewayError("UPSTREAM_ERROR", {
        detail: `上游 ${status}${detail === "" ? "" : ` ${detail}`}`,
      });
    }
    // 其余 4xx（含上下文超限）由上游给出可读原因，原样带回给调用方
    throw gatewayError("INVALID_REQUEST", { detail });
  }
}
