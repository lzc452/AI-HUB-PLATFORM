import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import { businessDayKey, businessDayStart } from "./llm-business-day.js";

/**
 * 用量读模型（`llm_usage_daily`）与聚合（PRD 9.3 / 9.4）。
 *
 * ## 为什么聚合用「按日 delete + insert」
 *
 * 聚合必须**可重跑**：worker 会周期性重算当天（调用还在持续写入），失败后也会重试。
 * 常见做法是 upsert 累加，但累加在重跑时会翻倍——这里改成「先删该日全部行，再按源表重算插入」，
 * 语义上等价于「该日的读模型 = 源表在该日的分组汇总」，天然幂等，也不会残留源数据已清理的旧行。
 * 代价是每次重算要重写当日行数（量级为「当日的员工×Key×模型组合数」，可控）。
 *
 * ## 业务日归属
 *
 * `usage_date` 由 `requested_at`（请求**开始**时刻）换算到 `Asia/Shanghai` 当地日期，
 * 与日配额判定用的是同一套口径（`llm-business-day.ts`），避免「用量看板与配额对不上」。
 */

export interface AggregationResult {
  /** 业务日（`YYYY-MM-DD`）。 */
  usageDate: string;
  /** 源表在该日的调用总数（含失败与拒绝）。 */
  sourceCalls: number;
  /** 写入读模型的行数（= 员工 × Key × 模型 组合数）。 */
  rows: number;
}

export interface DailyUsageTotal {
  calls: number;
  errorCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface DailyTotalRow {
  usageDate: string;
  calls: number;
  errorCalls: number;
  totalTokens: number;
}

export interface ModelUsageRow {
  model: string;
  calls: number;
  errorCalls: number;
  totalTokens: number;
}

export interface KeyUsageRow {
  keyId: string;
  keyName: string;
  keyStatus: string;
  calls: number;
  errorCalls: number;
  totalTokens: number;
}

export interface CallDetailRow {
  callId: string;
  keyId: string;
  employeeId: string;
  endpoint: string;
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
  requestedAt: Date;
}

export interface ListCallsInput {
  /** null = 全平台（管理面）；否则限定员工（本人视角）。 */
  employeeId: string | null;
  from: Date;
  to: Date;
  keyId?: string | undefined;
  model?: string | undefined;
  errorOnly?: boolean | undefined;
  limit: number;
  offset: number;
}

export interface LlmUsageRepository {
  /** 重算某个业务日的读模型（幂等）。 */
  aggregateDay(at: Date): Promise<AggregationResult>;
  /** 按业务日小计（看板趋势）。 */
  listDailyTotals(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<DailyTotalRow[]>;
  /** 按模型小计（用量构成）。 */
  listByModel(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<ModelUsageRow[]>;
  /** 按 Key 小计，含 Key 名（名称不冗余进读模型，查询时 join 事实表）。 */
  listByKey(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<KeyUsageRow[]>;
  sumDaily(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<DailyUsageTotal>;
  listCalls(
    input: ListCallsInput,
  ): Promise<{ items: CallDetailRow[]; total: number }>;
  /**
   * 直接从事实表统计区间用量（**兜底读**）。
   *
   * 用途：worker 尚未聚合完当天时，看板若只读读模型会显示 0——这是「看起来坏了」的经典体验。
   * 因此当日读模型为空且事实表有数据时，本方法提供实时口径，并由响应显式标注 `todayPartial`。
   */
  sumCallsLive(input: {
    employeeId: string | null;
    from: Date;
    to: Date;
  }): Promise<DailyUsageTotal>;
  /**
   * 有调用记录但读模型尚未覆盖的业务日（用于发现漏聚合，例如 worker 停机）。
   * 返回最近 N 天内的缺口日期，供运维补算。
   */
  findUnaggregatedDays(input: { lookbackDays: number }): Promise<string[]>;
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : Number(value);
}

function toIsoDate(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : businessDayKey(value);
}

export class KyselyLlmUsageRepository implements LlmUsageRepository {
  public constructor(private readonly db: Kysely<DatabaseSchema>) {}

  public async aggregateDay(at: Date): Promise<AggregationResult> {
    const start = businessDayStart(at);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const usageDate = businessDayKey(at);

    return this.db.transaction().execute(async (transaction) => {
      // 先清该日读模型：让「重跑」与「首次聚合」结果完全一致
      await sql`
        delete from llm_usage_daily where usage_date = ${usageDate}::date
      `.execute(transaction);

      const inserted = await sql<{ calls: string | number }>`
        insert into llm_usage_daily (
          usage_date, employee_id, key_id, model,
          calls, error_calls, prompt_tokens, completion_tokens, total_tokens
        )
        select
          ${usageDate}::date,
          employee_id,
          key_id,
          model,
          count(*),
          count(*) filter (where status_code >= 400),
          coalesce(sum(prompt_tokens), 0),
          coalesce(sum(completion_tokens), 0),
          coalesce(sum(total_tokens), 0)
        from llm_api_call_logs
        where requested_at >= ${start} and requested_at < ${end}
        group by employee_id, key_id, model
        returning calls
      `.execute(transaction);

      const source = await sql<{ total: string | number }>`
        select count(*) as total from llm_api_call_logs
        where requested_at >= ${start} and requested_at < ${end}
      `.execute(transaction);

      return {
        usageDate,
        sourceCalls: toNumber(source.rows[0]?.total ?? 0),
        rows: inserted.rows.length,
      };
    });
  }

  public async listDailyTotals(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<DailyTotalRow[]> {
    const scope = this.employeeScope(input.employeeId);
    const result = await sql<{
      usage_date: string | Date;
      calls: string | number;
      error_calls: string | number;
      total_tokens: string | number;
    }>`
      select
        usage_date,
        sum(calls) as calls,
        sum(error_calls) as error_calls,
        sum(total_tokens) as total_tokens
      from llm_usage_daily
      where usage_date between ${input.fromDate}::date and ${input.toDate}::date
      ${scope}
      group by usage_date
      order by usage_date asc
    `.execute(this.db);
    return result.rows.map((row) => ({
      usageDate: toIsoDate(row.usage_date),
      calls: toNumber(row.calls),
      errorCalls: toNumber(row.error_calls),
      totalTokens: toNumber(row.total_tokens),
    }));
  }

  public async listByModel(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<ModelUsageRow[]> {
    const scope = this.employeeScope(input.employeeId);
    const result = await sql<{
      model: string;
      calls: string | number;
      error_calls: string | number;
      total_tokens: string | number;
    }>`
      select
        model,
        sum(calls) as calls,
        sum(error_calls) as error_calls,
        sum(total_tokens) as total_tokens
      from llm_usage_daily
      where usage_date between ${input.fromDate}::date and ${input.toDate}::date
      ${scope}
      group by model
      order by sum(total_tokens) desc
    `.execute(this.db);
    return result.rows.map((row) => ({
      model: row.model,
      calls: toNumber(row.calls),
      errorCalls: toNumber(row.error_calls),
      totalTokens: toNumber(row.total_tokens),
    }));
  }

  public async listByKey(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<KeyUsageRow[]> {
    const scope = this.employeeScope(input.employeeId);
    const result = await sql<{
      key_id: string;
      key_name: string | null;
      key_status: string | null;
      calls: string | number;
      error_calls: string | number;
      total_tokens: string | number;
    }>`
      select
        usage.key_id,
        keys.name as key_name,
        keys.status as key_status,
        sum(usage.calls) as calls,
        sum(usage.error_calls) as error_calls,
        sum(usage.total_tokens) as total_tokens
      from llm_usage_daily usage
      left join llm_api_keys keys on keys.key_id = usage.key_id
      where usage.usage_date between ${input.fromDate}::date and ${input.toDate}::date
      ${scope}
      group by usage.key_id, keys.name, keys.status
      order by sum(usage.total_tokens) desc
    `.execute(this.db);
    return result.rows.map((row) => ({
      keyId: row.key_id,
      // Key 已被物理清理（理论上不会：删除是软删）时回退为占位名，避免看板出现空白行
      keyName: row.key_name ?? "(已删除)",
      keyStatus: row.key_status ?? "revoked",
      calls: toNumber(row.calls),
      errorCalls: toNumber(row.error_calls),
      totalTokens: toNumber(row.total_tokens),
    }));
  }

  public async sumCallsLive(input: {
    employeeId: string | null;
    from: Date;
    to: Date;
  }): Promise<DailyUsageTotal> {
    const scope = this.employeeScope(input.employeeId);
    const result = await sql<{
      calls: string | number;
      error_calls: string | number;
      prompt_tokens: string | number;
      completion_tokens: string | number;
      total_tokens: string | number;
    }>`
      select
        count(*) as calls,
        count(*) filter (where status_code >= 400) as error_calls,
        coalesce(sum(prompt_tokens), 0) as prompt_tokens,
        coalesce(sum(completion_tokens), 0) as completion_tokens,
        coalesce(sum(total_tokens), 0) as total_tokens
      from llm_api_call_logs
      where requested_at >= ${input.from} and requested_at < ${input.to}
      ${scope}
    `.execute(this.db);
    const row = result.rows[0];
    return {
      calls: toNumber(row?.calls ?? 0),
      errorCalls: toNumber(row?.error_calls ?? 0),
      promptTokens: toNumber(row?.prompt_tokens ?? 0),
      completionTokens: toNumber(row?.completion_tokens ?? 0),
      totalTokens: toNumber(row?.total_tokens ?? 0),
    };
  }

  private employeeScope(employeeId: string | null) {
    return employeeId === null ? sql`` : sql`and employee_id = ${employeeId}`;
  }

  public async sumDaily(input: {
    employeeId: string | null;
    fromDate: string;
    toDate: string;
  }): Promise<DailyUsageTotal> {
    const scope =
      input.employeeId === null
        ? sql``
        : sql`and employee_id = ${input.employeeId}`;
    const result = await sql<{
      calls: string | number;
      error_calls: string | number;
      prompt_tokens: string | number;
      completion_tokens: string | number;
      total_tokens: string | number;
    }>`
      select
        coalesce(sum(calls), 0) as calls,
        coalesce(sum(error_calls), 0) as error_calls,
        coalesce(sum(prompt_tokens), 0) as prompt_tokens,
        coalesce(sum(completion_tokens), 0) as completion_tokens,
        coalesce(sum(total_tokens), 0) as total_tokens
      from llm_usage_daily
      where usage_date between ${input.fromDate}::date and ${input.toDate}::date
      ${scope}
    `.execute(this.db);

    const row = result.rows[0];
    return {
      calls: toNumber(row?.calls ?? 0),
      errorCalls: toNumber(row?.error_calls ?? 0),
      promptTokens: toNumber(row?.prompt_tokens ?? 0),
      completionTokens: toNumber(row?.completion_tokens ?? 0),
      totalTokens: toNumber(row?.total_tokens ?? 0),
    };
  }

  public async listCalls(
    input: ListCallsInput,
  ): Promise<{ items: CallDetailRow[]; total: number }> {
    const employeeScope =
      input.employeeId === null
        ? sql``
        : sql`and employee_id = ${input.employeeId}`;
    const keyScope =
      input.keyId === undefined ? sql`` : sql`and key_id = ${input.keyId}`;
    const modelScope =
      input.model === undefined ? sql`` : sql`and model = ${input.model}`;
    const errorScope =
      input.errorOnly === true ? sql`and status_code >= 400` : sql``;

    const [rows, total] = await Promise.all([
      sql<{
        call_id: string;
        key_id: string;
        employee_id: string;
        endpoint: string;
        model: string;
        stream: boolean;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        duration_ms: number;
        status_code: number;
        error_code: string | null;
        usage_estimated: boolean;
        trace_id: string | null;
        requested_at: Date;
      }>`
        select * from llm_api_call_logs
        where requested_at >= ${input.from} and requested_at < ${input.to}
        ${employeeScope} ${keyScope} ${modelScope} ${errorScope}
        order by requested_at desc
        limit ${input.limit} offset ${input.offset}
      `.execute(this.db),
      sql<{ total: string | number }>`
        select count(*) as total from llm_api_call_logs
        where requested_at >= ${input.from} and requested_at < ${input.to}
        ${employeeScope} ${keyScope} ${modelScope} ${errorScope}
      `.execute(this.db),
    ]);

    return {
      items: rows.rows.map((row) => ({
        callId: row.call_id,
        keyId: row.key_id,
        employeeId: row.employee_id,
        endpoint: row.endpoint,
        model: row.model,
        stream: row.stream,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        totalTokens: row.total_tokens,
        durationMs: row.duration_ms,
        statusCode: row.status_code,
        errorCode: row.error_code,
        usageEstimated: row.usage_estimated,
        traceId: row.trace_id,
        requestedAt: row.requested_at,
      })),
      total: toNumber(total.rows[0]?.total ?? 0),
    };
  }

  public async findUnaggregatedDays(input: {
    lookbackDays: number;
  }): Promise<string[]> {
    // 用上海时区把 requested_at 折算成当地日期，再与读模型比对缺口
    const result = await sql<{ day: string }>`
      with days as (
        select distinct (requested_at at time zone 'Asia/Shanghai')::date as day
        from llm_api_call_logs
        where requested_at >= now() - (${input.lookbackDays} || ' days')::interval
      ),
      aggregated as (
        select distinct usage_date as day from llm_usage_daily
      )
      select to_char(days.day, 'YYYY-MM-DD') as day
      from days
      left join aggregated on aggregated.day = days.day
      where aggregated.day is null
      order by day asc
    `.execute(this.db);
    return result.rows.map((row) => row.day);
  }
}
