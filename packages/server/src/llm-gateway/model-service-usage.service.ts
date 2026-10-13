import { businessDayKey, businessDayStart } from "./llm-business-day.js";
import {
  MODEL_SERVICE_ERROR_CODES,
  ModelServiceError,
} from "./llm-gateway.types.js";
import type {
  CallDetailRow,
  DailyTotalRow,
  DailyUsageTotal,
  KeyUsageRow,
  LlmUsageRepository,
  ModelUsageRow,
} from "./llm-usage.repository.js";

/**
 * 用量查询服务（PRD 8.1 用量视图 / 9.3）。
 *
 * 读的是**读模型**（`llm_usage_daily`），因此查询与明细表规模解耦。唯一的例外是当日兜底：
 * worker 聚合有间隔，若当日读模型还是空的而事实表已有数据，这里实时补上并标注
 * `todayPartial=true`——看板宁可显式说「当日为实时数据」，也不要显示成一个假的 0。
 *
 * 数据权限由调用方决定传入的 `employeeId`：本人视角锁定自己，管理面传 null 看全平台。
 */

export const USAGE_RANGE_KEYS = ["today", "7d", "30d", "custom"] as const;
export type UsageRangeKey = (typeof USAGE_RANGE_KEYS)[number];

/** 自定义区间上限（超过一个季度既无必要、也容易拖垮读模型查询）。 */
const CUSTOM_RANGE_MAX_DAYS = 90;
const MAX_PAGE_SIZE = 200;

export interface UsageSummaryQuery {
  range?: UsageRangeKey | undefined;
  /** `YYYY-MM-DD`（仅 range=custom 时必填）。 */
  from?: string | undefined;
  to?: string | undefined;
}

export interface UsageSummary {
  range: UsageRangeKey;
  fromDate: string;
  toDate: string;
  /** true = 当日读数来自事实表实时兜底（读模型尚未覆盖当日）。 */
  todayPartial: boolean;
  totals: DailyUsageTotal;
  daily: DailyTotalRow[];
  byModel: ModelUsageRow[];
  byKey: KeyUsageRow[];
}

export interface ListCallsQuery {
  range?: UsageRangeKey | undefined;
  from?: string | undefined;
  to?: string | undefined;
  keyId?: string | undefined;
  model?: string | undefined;
  errorOnly?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CallPage {
  items: CallDetailRow[];
  total: number;
  page: number;
  pageSize: number;
}

export class ModelServiceUsageService {
  public constructor(
    private readonly usage: LlmUsageRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getSummary(
    scope: { employeeId: string | null },
    query: UsageSummaryQuery,
  ): Promise<UsageSummary> {
    const { range, fromDate, toDate } = this.resolveRange(query);

    const [totals, daily, byModel, byKey] = await Promise.all([
      this.usage.sumDaily({ employeeId: scope.employeeId, fromDate, toDate }),
      this.usage.listDailyTotals({
        employeeId: scope.employeeId,
        fromDate,
        toDate,
      }),
      this.usage.listByModel({
        employeeId: scope.employeeId,
        fromDate,
        toDate,
      }),
      this.usage.listByKey({ employeeId: scope.employeeId, fromDate, toDate }),
    ]);

    const todayKey = businessDayKey(this.now());
    const coveredToday = daily.some((row) => row.usageDate === todayKey);
    const inRangeToday = fromDate <= todayKey && todayKey <= toDate;
    if (coveredToday || !inRangeToday) {
      return {
        range,
        fromDate,
        toDate,
        todayPartial: false,
        totals,
        daily,
        byModel,
        byKey,
      };
    }

    // 当日兜底：读模型还没有今天的行（worker 未跑或刚重启）
    const live = await this.usage.sumCallsLive({
      employeeId: scope.employeeId,
      from: businessDayStart(this.now()),
      to: this.now(),
    });
    if (live.calls === 0) {
      return {
        range,
        fromDate,
        toDate,
        todayPartial: false,
        totals,
        daily,
        byModel,
        byKey,
      };
    }

    return {
      range,
      fromDate,
      toDate,
      todayPartial: true,
      totals: {
        calls: totals.calls + live.calls,
        errorCalls: totals.errorCalls + live.errorCalls,
        promptTokens: totals.promptTokens + live.promptTokens,
        completionTokens: totals.completionTokens + live.completionTokens,
        totalTokens: totals.totalTokens + live.totalTokens,
      },
      daily: [
        ...daily,
        {
          usageDate: todayKey,
          calls: live.calls,
          errorCalls: live.errorCalls,
          totalTokens: live.totalTokens,
        },
      ],
      // 兜底只补「当日总计」：按模型/按 Key 的构成要等聚合，避免在这里做一次重查询
      byModel,
      byKey,
    };
  }

  public async listCalls(
    scope: { employeeId: string | null },
    query: ListCallsQuery,
  ): Promise<CallPage> {
    const { fromDate, toDate } = this.resolveRange(query);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 20));

    // 明细读事实表（按 request_at 区间），区间用业务日边界换算成时刻，与聚合口径一致
    const from = businessDayStart(new Date(`${fromDate}T12:00:00+08:00`));
    const to = new Date(
      businessDayStart(new Date(`${toDate}T12:00:00+08:00`)).getTime() +
        24 * 60 * 60 * 1000,
    );

    const { items, total } = await this.usage.listCalls({
      employeeId: scope.employeeId,
      from,
      to,
      ...(query.keyId === undefined ? {} : { keyId: query.keyId }),
      ...(query.model === undefined ? {} : { model: query.model }),
      ...(query.errorOnly === undefined ? {} : { errorOnly: query.errorOnly }),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  }

  /** 区间解析：三种预设 + 自定义（含跨度上限与格式校验）。 */
  private resolveRange(query: {
    range?: UsageRangeKey | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }): { range: UsageRangeKey; fromDate: string; toDate: string } {
    const todayKey = businessDayKey(this.now());
    const range = query.range ?? "today";

    if (range === "custom") {
      if (query.from === undefined || query.to === undefined) {
        throw new ModelServiceError(
          MODEL_SERVICE_ERROR_CODES.RANGE_INVALID,
          "自定义区间必须同时提供 from 与 to",
        );
      }
      const spanDays = this.spanDays(query.from, query.to);
      if (spanDays === null) {
        throw new ModelServiceError(
          MODEL_SERVICE_ERROR_CODES.RANGE_INVALID,
          "区间起止必须为 YYYY-MM-DD 且 from ≤ to",
        );
      }
      if (spanDays > CUSTOM_RANGE_MAX_DAYS) {
        throw new ModelServiceError(
          MODEL_SERVICE_ERROR_CODES.RANGE_INVALID,
          `自定义区间不得超过 ${CUSTOM_RANGE_MAX_DAYS} 天`,
        );
      }
      return { range, fromDate: query.from, toDate: query.to };
    }

    const offsetDays = range === "today" ? 0 : range === "7d" ? 6 : 29;
    const fromDate = businessDayKey(
      new Date(this.now().getTime() - offsetDays * 24 * 60 * 60 * 1000),
    );
    return { range, fromDate, toDate: todayKey };
  }

  /** 返回跨度天数；格式非法或 from > to 时返回 null（由调用方转成领域错误）。 */
  private spanDays(from: string, to: string): number | null {
    const pattern = /^\d{4}-\d{2}-\d{2}$/u;
    if (!pattern.test(from) || !pattern.test(to)) return null;
    const fromMs = Date.parse(`${from}T00:00:00Z`);
    const toMs = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs < fromMs)
      return null;
    return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;
  }
}
