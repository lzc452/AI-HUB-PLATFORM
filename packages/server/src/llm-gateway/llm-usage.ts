/**
 * 用量解析与估算（PRD 8.2 流式约束 / 9.2 `usage_estimated`）。
 *
 * 平台**不改写**上游响应，但需要把 token 数记进台账：
 * - 优先取上游 `usage`（非流式恒有；流式靠注入 `stream_options.include_usage` 让末块带出）；
 * - 上游确实没给（例如注入未生效的旧版本 vLLM）时，用**本地近似**兜底，并打上
 *   `usageEstimated=true` —— 看板与对账必须能区分「上游实测」与「本地估算」，
 *   否则数字真假难辨（评审 R2-04）。
 */

export interface UsageNumbers {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: boolean;
}

const MODEL_NAME_MAX = 64;

function toCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  }
  return null;
}

/** 从上游报文中严格解析 usage；字段不全则返回 null（不做半真半假的补零）。 */
export function fromUpstreamUsage(body: unknown): UsageNumbers | null {
  if (typeof body !== "object" || body === null) return null;
  const usage = (body as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return null;
  const prompt = toCount((usage as { prompt_tokens?: unknown }).prompt_tokens);
  const completion = toCount(
    (usage as { completion_tokens?: unknown }).completion_tokens,
  );
  const total = toCount((usage as { total_tokens?: unknown }).total_tokens);
  if (prompt === null || completion === null) return null;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total ?? prompt + completion,
    estimated: false,
  };
}

/**
 * 本地近似：按字符数 / 4 估算。
 *
 * **这是粗略近似**（中英混排、代码、多字节字符都会偏），只在上游未返回 usage 时兜底，
 * 且一定带 `estimated=true`。常态下由网关自动注入 `stream_options.include_usage`
 * 让上游把真实用量带回来，估算只是兜底路径。
 */
export function estimateUsage(input: {
  requestPayload: Record<string, unknown>;
  completionText: string;
}): UsageNumbers {
  const promptChars = JSON.stringify(
    input.requestPayload["messages"] ?? "",
  ).length;
  const promptTokens = Math.max(1, Math.ceil(promptChars / 4));
  const completionTokens = Math.max(
    0,
    Math.ceil(input.completionText.length / 4),
  );
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  };
}

/**
 * 归一化模型名（评审 R2-03）：优先上游响应里的 `model`，否则回退请求值；
 * 一律截断到 64 字符，避免调用方用超长/伪造的模型串撑爆聚合表主键。
 */
export function normalizeModelName(input: {
  responseModel?: unknown;
  requestModel?: unknown;
}): string {
  const candidate =
    typeof input.responseModel === "string" && input.responseModel.trim() !== ""
      ? input.responseModel
      : typeof input.requestModel === "string"
        ? input.requestModel
        : "";
  const trimmed = candidate.trim();
  if (trimmed === "") return "unknown";
  return trimmed.slice(0, MODEL_NAME_MAX);
}

/** 从流式产出的文本块里抽取补全内容（用于估算 completion tokens）。 */
export function extractCompletionDelta(dataLine: string): string {
  try {
    const parsed = JSON.parse(dataLine) as {
      choices?: readonly { delta?: { content?: unknown } }[];
    };
    const parts = (parsed.choices ?? [])
      .map((choice) => choice.delta?.content)
      .filter((content): content is string => typeof content === "string");
    return parts.join("");
  } catch {
    return "";
  }
}

/** 从单条 SSE 数据行里解析 usage（`stream_options.include_usage` 的末块）。 */
export function extractSseUsage(dataLine: string): UsageNumbers | null {
  try {
    return fromUpstreamUsage(JSON.parse(dataLine) as unknown);
  } catch {
    return null;
  }
}
