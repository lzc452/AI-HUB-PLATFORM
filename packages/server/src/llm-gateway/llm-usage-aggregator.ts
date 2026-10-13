import type { Logger } from "pino";
import { businessDayKey, businessDayStart } from "./llm-business-day.js";
import type {
  AggregationResult,
  LlmUsageRepository,
} from "./llm-usage.repository.js";

/**
 * 用量聚合器（PRD 9.3）。
 *
 * worker 周期性调用本聚合器把事实表（`llm_api_call_logs`）折算成读模型（`llm_usage_daily`）。
 * 三个设计要点：
 *
 * 1. **幂等**：底层按业务日 delete-then-insert 重算，因此「跑几次结果都一样」，
 *    worker 重启、重试、补算都不会把数字翻倍。
 * 2. **回看窗口**：默认重算「今天 + 昨天」。调用记录可能在跨日边界附近才落库
 *    （流式响应耗时、时钟偏差），只算今天会漏掉刚补进昨天的那些行。
 * 3. **自愈**：每轮顺带扫描最近 30 天的「有事实但无读模型」的日子并补算——
 *    worker 停机几天再起来时不会留下永久空洞。单轮补算天数设上限，避免长时间占用。
 */

export interface UsageAggregationOptions {
  /** 常规回看天数（默认 2：今天 + 昨天）。 */
  lookbackDays?: number;
  /** 自愈扫描窗口（默认 30 天）。 */
  gapScanDays?: number;
  /** 单轮最多补算多少个缺口日（默认 10）。 */
  maxGapDaysPerRun?: number;
}

export interface UsageAggregationRunResult {
  /** 本轮实际重算的日子。 */
  days: AggregationResult[];
  /** 扫描到的缺口（含本轮未处理的，便于运维判断是否要跑回填）。 */
  gaps: string[];
  /** 本轮因上限未处理的缺口数。 */
  skippedGaps: number;
}

export class LlmUsageAggregator {
  private readonly now: () => Date;
  private readonly logger: Logger | undefined;

  public constructor(
    private readonly repository: LlmUsageRepository,
    options: { now?: () => Date; logger?: Logger | undefined } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger;
  }

  /** 单日补算（运维按需要补历史）。 */
  public async aggregateDay(dayKey: string): Promise<AggregationResult> {
    // 以该业务日**正午**为锚点：无论实现细节如何，正午一定落在这个业务日内，
    // 避免「传入日期串 → 时刻解析」时因时区回退到前一天。
    const anchor = new Date(`${dayKey}T12:00:00+08:00`);
    if (Number.isNaN(anchor.getTime())) {
      throw new Error(`INVALID_BUSINESS_DAY: ${dayKey}`);
    }
    return this.repository.aggregateDay(anchor);
  }

  public async run(
    options: UsageAggregationOptions = {},
  ): Promise<UsageAggregationRunResult> {
    const lookbackDays = options.lookbackDays ?? 2;
    const gapScanDays = options.gapScanDays ?? 30;
    const maxGapDays = options.maxGapDaysPerRun ?? 10;

    const at = this.now();
    const days: AggregationResult[] = [];
    const processed = new Set<string>();

    // 1) 常规回看
    for (let offset = 0; offset < lookbackDays; offset += 1) {
      const target = new Date(at.getTime() - offset * 24 * 60 * 60 * 1000);
      const key = businessDayKey(target);
      const result = await this.repository.aggregateDay(target);
      days.push(result);
      processed.add(key);
    }

    // 2) 自愈缺口（超出回看窗口、但事实表有数据的日子）
    const gaps = await this.repository.findUnaggregatedDays({
      lookbackDays: gapScanDays,
    });
    const pending = gaps.filter((day) => !processed.has(day));
    const toProcess = pending.slice(0, maxGapDays);
    for (const day of toProcess) {
      days.push(await this.aggregateDay(day));
    }
    const skippedGaps = pending.length - toProcess.length;
    if (skippedGaps > 0) {
      this.logger?.warn(
        { skippedGaps, gaps: pending.slice(maxGapDays) },
        "用量聚合缺口超出单轮上限，剩余缺口将在后续轮次或回填脚本处理",
      );
    }

    return { days, gaps, skippedGaps };
  }
}

/** worker 侧的运行器：把聚合器包成「无参可调用」，便于 setInterval 与测试复用。 */
export function createUsageAggregationRunner(
  aggregator: LlmUsageAggregator,
  options: UsageAggregationOptions = {},
): () => Promise<UsageAggregationRunResult> {
  return () => aggregator.run(options);
}

/** 业务日起点（供调用方按区间取数，避免各处重复换算）。 */
export { businessDayStart };
