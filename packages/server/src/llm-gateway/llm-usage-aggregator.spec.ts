import { describe, expect, it } from "vitest";
import {
  LlmUsageAggregator,
  createUsageAggregationRunner,
} from "./llm-usage-aggregator.js";
import type { LlmUsageRepository } from "./llm-usage.repository.js";

const NOW = new Date("2026-10-13T09:00:00.000Z"); // 上海 10-13 17:00

function repositoryStub(options: { gaps?: string[] } = {}) {
  const aggregated: string[] = [];
  const repository: LlmUsageRepository = {
    async aggregateDay(at) {
      const usageDate = new Date(at.getTime() + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      aggregated.push(usageDate);
      return { usageDate, sourceCalls: 0, rows: 0 };
    },
    async listDailyTotals() {
      return [];
    },
    async listByModel() {
      return [];
    },
    async listByKey() {
      return [];
    },
    async sumDaily() {
      return {
        calls: 0,
        errorCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    },
    async sumCallsLive() {
      return {
        calls: 0,
        errorCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    },
    async listCalls() {
      return { items: [], total: 0 };
    },
    async findUnaggregatedDays() {
      return options.gaps ?? [];
    },
    async countKeysNearDailyLimit() {
      return 0;
    },
  };
  return { repository, aggregated };
}

describe("用量聚合器", () => {
  it("默认回看今天与昨天（跨日写入的调用不会漏聚合）", async () => {
    const { repository, aggregated } = repositoryStub();
    const aggregator = new LlmUsageAggregator(repository, { now: () => NOW });

    const result = await aggregator.run();

    expect(aggregated).toEqual(["2026-10-13", "2026-10-12"]);
    expect(result.days).toHaveLength(2);
    expect(result.skippedGaps).toBe(0);
  });

  it("自愈：扫描到的缺口日会被补算，且不重复处理回看窗口内的日子", async () => {
    const { repository, aggregated } = repositoryStub({
      gaps: ["2026-10-13", "2026-10-10", "2026-10-09"],
    });
    const aggregator = new LlmUsageAggregator(repository, { now: () => NOW });

    const result = await aggregator.run();

    // 10-13 已在回看窗口内聚合过，不应重复
    expect(aggregated).toEqual([
      "2026-10-13",
      "2026-10-12",
      "2026-10-10",
      "2026-10-09",
    ]);
    expect(result.gaps).toHaveLength(3);
    expect(result.skippedGaps).toBe(0);
  });

  it("缺口超出单轮上限时只处理一部分并上报剩余（避免长时间占用 worker）", async () => {
    const gaps = Array.from(
      { length: 12 },
      (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`,
    );
    const { repository, aggregated } = repositoryStub({ gaps });
    const aggregator = new LlmUsageAggregator(repository, { now: () => NOW });

    const result = await aggregator.run({ maxGapDaysPerRun: 3 });

    expect(result.skippedGaps).toBe(9);
    expect(aggregated).toHaveLength(2 + 3);
  });

  it("单日补算以当地正午为锚点（避免跨时区解析回退到前一天）", async () => {
    const { repository, aggregated } = repositoryStub();
    const aggregator = new LlmUsageAggregator(repository, { now: () => NOW });

    const result = await aggregator.aggregateDay("2026-10-05");

    expect(result.usageDate).toBe("2026-10-05");
    expect(aggregated[0]).toBe("2026-10-05");
  });

  it("非法日期串直接抛错，不静默聚合到错误的日子", async () => {
    const { repository } = repositoryStub();
    const aggregator = new LlmUsageAggregator(repository, { now: () => NOW });
    await expect(aggregator.aggregateDay("not-a-day")).rejects.toThrow(
      /INVALID_BUSINESS_DAY/u,
    );
  });

  it("运行器封装可被 worker 直接调用（无参）", async () => {
    const { repository, aggregated } = repositoryStub();
    const runner = createUsageAggregationRunner(
      new LlmUsageAggregator(repository, { now: () => NOW }),
      { lookbackDays: 1 },
    );
    await runner();
    expect(aggregated).toEqual(["2026-10-13"]);
  });
});
