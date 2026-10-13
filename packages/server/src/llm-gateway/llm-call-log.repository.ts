import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";

/**
 * 调用记录（PRD 9.2 事实表）。
 *
 * **100% 落账**：成功、失败、被拒（鉴权/配额/熔断）都要有一行，被拒时 tokens 记 0。
 * 没有记录，日配额与用量看板就都是无源之水——所以台账写入属于 M3（配额的地基），
 * 而聚合与看板（`llm_usage_daily` + Console）留在 M4。
 */

export type LlmCallEndpoint = "chat_completions" | "embeddings" | "models";

export interface CallLogInput {
  keyId: string;
  employeeId: string;
  endpoint: LlmCallEndpoint;
  /** 归一化模型名：取上游响应中的 model，回退请求值并截断至 64。 */
  model: string;
  stream: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  statusCode: number;
  errorCode: string | null;
  usageEstimated: boolean;
  traceId: string | null;
  /** 请求**开始**时刻（不是记账时刻），用于业务日归属。 */
  requestedAt: Date;
}

export interface LlmCallLogRepository {
  insert(input: CallLogInput): Promise<void>;
  /** 某员工自给定业务日起点的已用 token 总量（日配额判定的唯一事实来源）。 */
  sumTokensSince(input: { employeeId: string; since: Date }): Promise<number>;
}

export class KyselyLlmCallLogRepository implements LlmCallLogRepository {
  public constructor(private readonly db: Kysely<DatabaseSchema>) {}

  public async insert(input: CallLogInput): Promise<void> {
    await this.db
      .insertInto("llm_api_call_logs")
      .values({
        key_id: input.keyId,
        employee_id: input.employeeId,
        endpoint: input.endpoint,
        model: input.model,
        stream: input.stream,
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        total_tokens: input.totalTokens,
        duration_ms: input.durationMs,
        status_code: input.statusCode,
        error_code: input.errorCode,
        usage_estimated: input.usageEstimated,
        trace_id: input.traceId,
        requested_at: input.requestedAt,
      })
      .execute();
  }

  public async sumTokensSince(input: {
    employeeId: string;
    since: Date;
  }): Promise<number> {
    const row = await this.db
      .selectFrom("llm_api_call_logs")
      .select(sql<number>`coalesce(sum(total_tokens), 0)`.as("tokens"))
      .where("employee_id", "=", input.employeeId)
      .where("requested_at", ">=", input.since)
      .executeTakeFirst();
    // sum(bigint) 在 pg 驱动下可能是字符串，统一归一为 number
    const value = (row as { tokens?: number | string } | undefined)?.tokens;
    return value === undefined ? 0 : Number(value);
  }
}
