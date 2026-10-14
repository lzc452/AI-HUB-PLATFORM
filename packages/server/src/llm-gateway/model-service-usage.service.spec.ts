import { describe, expect, it } from "vitest";
import { ModelServiceError } from "./llm-gateway.types.js";
import { ModelServiceUsageService } from "./model-service-usage.service.js";
import type { LlmUsageRepository } from "./llm-usage.repository.js";

const NOW = new Date("2026-10-13T09:00:00.000Z"); // 上海 10-13 17:00

interface StubOptions {
  /** 读模型已有数据的业务日（用于验证当日兜底逻辑）。 */
  dailyDates?: string[];
  totalTokens?: number;
  liveTokens?: number;
  calls?: Array<{
    callId: string;
    requestedAt: Date;
    statusCode: number;
    employeeId: string;
  }>;
}

function usageStub(options: StubOptions = {}) {
  const calls = options.calls ?? [];
  const seen: {
    sumDaily: unknown[];
    listCalls: unknown[];
    live: unknown[];
  } = { sumDaily: [], listCalls: [], live: [] };

  const repository: LlmUsageRepository = {
    async aggregateDay(at) {
      return {
        usageDate: at.toISOString().slice(0, 10),
        sourceCalls: 0,
        rows: 0,
      };
    },
    async listDailyTotals() {
      return (options.dailyDates ?? []).map((usageDate) => ({
        usageDate,
        calls: 1,
        errorCalls: 0,
        totalTokens: 10,
      }));
    },
    async listByModel() {
      return [
        { model: "Qwen3.5 35B A3B", calls: 1, errorCalls: 0, totalTokens: 10 },
      ];
    },
    async listByKey() {
      return [
        {
          keyId: "key-1",
          keyName: "notebook-dev",
          keyStatus: "active",
          calls: 1,
          errorCalls: 0,
          totalTokens: 10,
        },
      ];
    },
    async sumDaily(input) {
      seen.sumDaily.push(input);
      return {
        calls: 1,
        errorCalls: 0,
        promptTokens: 4,
        completionTokens: 6,
        totalTokens: options.totalTokens ?? 10,
      };
    },
    async sumCallsLive(input) {
      seen.live.push(input);
      return {
        calls: options.liveTokens === undefined ? 0 : 2,
        errorCalls: 0,
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: options.liveTokens ?? 0,
      };
    },
    async listCalls(input) {
      seen.listCalls.push(input);
      const filtered = calls.filter((call) =>
        input.employeeId === null ? true : call.employeeId === input.employeeId,
      );
      const page = filtered.slice(input.offset, input.offset + input.limit);
      return {
        items: page.map((call) => ({
          callId: call.callId,
          keyId: "key-1",
          employeeId: call.employeeId,
          endpoint: "chat_completions",
          model: "Qwen3.5 35B A3B",
          stream: false,
          promptTokens: 4,
          completionTokens: 6,
          totalTokens: 10,
          durationMs: 120,
          statusCode: call.statusCode,
          errorCode: call.statusCode >= 400 ? "upstream_error" : null,
          usageEstimated: false,
          traceId: "trace-1",
          requestedAt: call.requestedAt,
        })),
        total: filtered.length,
      };
    },
    async findUnaggregatedDays() {
      return [];
    },
    async countKeysNearDailyLimit() {
      return 0;
    },
  };
  return { repository, seen };
}

async function expectDomainError(
  operation: () => Promise<unknown>,
): Promise<ModelServiceError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ModelServiceError);
    return error as ModelServiceError;
  }
  throw new Error("期望抛出 ModelServiceError");
}

describe("用量查询服务", () => {
  it("默认区间为今日（业务日按 Asia/Shanghai 计算）", async () => {
    const { repository, seen } = usageStub({ dailyDates: ["2026-10-13"] });
    const service = new ModelServiceUsageService(repository, () => NOW);

    const summary = await service.getSummary({ employeeId: "E100" }, {});

    expect(summary.range).toBe("today");
    expect(summary.fromDate).toBe("2026-10-13");
    expect(summary.toDate).toBe("2026-10-13");
    expect(seen.sumDaily[0]).toMatchObject({ employeeId: "E100" });
    expect(summary.todayPartial).toBe(false);
  });

  it("7 日与 30 日窗口按业务日回推（含当日）", async () => {
    const { repository } = usageStub({ dailyDates: ["2026-10-13"] });
    const service = new ModelServiceUsageService(repository, () => NOW);

    await expect(
      service.getSummary({ employeeId: null }, { range: "7d" }),
    ).resolves.toMatchObject({
      fromDate: "2026-10-07",
      toDate: "2026-10-13",
    });
    await expect(
      service.getSummary({ employeeId: null }, { range: "30d" }),
    ).resolves.toMatchObject({
      fromDate: "2026-09-14",
      toDate: "2026-10-13",
    });
  });

  it("自定义区间：缺参、倒序或超 90 天都返回区间非法", async () => {
    const { repository } = usageStub();
    const service = new ModelServiceUsageService(repository, () => NOW);

    const missing = await expectDomainError(() =>
      service.getSummary(
        { employeeId: null },
        { range: "custom", from: "2026-10-01" },
      ),
    );
    expect(missing.code).toBe("MODEL_USAGE_RANGE_INVALID");

    const reversed = await expectDomainError(() =>
      service.getSummary(
        { employeeId: null },
        { range: "custom", from: "2026-10-10", to: "2026-10-01" },
      ),
    );
    expect(reversed.code).toBe("MODEL_USAGE_RANGE_INVALID");

    const tooLong = await expectDomainError(() =>
      service.getSummary(
        { employeeId: null },
        { range: "custom", from: "2026-01-01", to: "2026-10-13" },
      ),
    );
    expect(tooLong.code).toBe("MODEL_USAGE_RANGE_INVALID");
  });

  it("当日读模型未就绪且事实表有数据时，实时兜底并标注 todayPartial", async () => {
    // 读模型里只有昨天，没有今天
    const { repository, seen } = usageStub({
      dailyDates: ["2026-10-12"],
      totalTokens: 10,
      liveTokens: 30,
    });
    const service = new ModelServiceUsageService(repository, () => NOW);

    const summary = await service.getSummary({ employeeId: "E100" }, {});

    expect(summary.todayPartial).toBe(true);
    expect(summary.totals.totalTokens).toBe(40); // 读模型 10 + 实时 30
    expect(summary.daily.map((row) => row.usageDate)).toEqual([
      "2026-10-12",
      "2026-10-13",
    ]);
    expect(seen.live).toHaveLength(1);
  });

  it("当日读模型未就绪但事实表也没数据时不标注兜底（避免把空态说成实时）", async () => {
    const { repository, seen } = usageStub({ dailyDates: ["2026-10-12"] });
    const service = new ModelServiceUsageService(repository, () => NOW);

    const summary = await service.getSummary({ employeeId: "E100" }, {});

    expect(summary.todayPartial).toBe(false);
    expect(summary.totals.totalTokens).toBe(10);
    // 仍然查了实时（只是为 0），但不改口径
    expect(seen.live).toHaveLength(1);
  });

  it("读模型已覆盖当日时不再回退实时（口径以聚合为准）", async () => {
    const { repository, seen } = usageStub({
      dailyDates: ["2026-10-13"],
      totalTokens: 10,
      liveTokens: 999,
    });
    const service = new ModelServiceUsageService(repository, () => NOW);

    const summary = await service.getSummary({ employeeId: "E100" }, {});

    expect(summary.todayPartial).toBe(false);
    expect(summary.totals.totalTokens).toBe(10);
    expect(seen.live).toHaveLength(0);
  });

  it("查询区间不含当日时不触发兜底（历史区间只读读模型）", async () => {
    const { repository, seen } = usageStub({ dailyDates: ["2026-10-01"] });
    const service = new ModelServiceUsageService(repository, () => NOW);

    const summary = await service.getSummary(
      { employeeId: null },
      { range: "custom", from: "2026-10-01", to: "2026-10-05" },
    );

    expect(summary.todayPartial).toBe(false);
    expect(seen.live).toHaveLength(0);
  });

  it("调用明细：本人视角只看到自己的记录", async () => {
    const { repository, seen } = usageStub({
      calls: [
        { callId: "c1", requestedAt: NOW, statusCode: 200, employeeId: "E100" },
        { callId: "c2", requestedAt: NOW, statusCode: 200, employeeId: "E200" },
      ],
    });
    const service = new ModelServiceUsageService(repository, () => NOW);

    const page = await service.listCalls(
      { employeeId: "E100" },
      { pageSize: 10 },
    );

    expect(page.total).toBe(1);
    expect(page.items[0]?.callId).toBe("c1");
    expect(seen.listCalls[0]).toMatchObject({
      employeeId: "E100",
      limit: 10,
      offset: 0,
    });
  });

  it("调用明细：管理面传 null 看全平台，并把业务日区间换算成时刻", async () => {
    const { repository, seen } = usageStub({
      calls: [
        { callId: "c1", requestedAt: NOW, statusCode: 500, employeeId: "E100" },
      ],
    });
    const service = new ModelServiceUsageService(repository, () => NOW);

    const page = await service.listCalls(
      { employeeId: null },
      { range: "today", errorOnly: true, page: 2, pageSize: 5 },
    );

    expect(page.total).toBe(1);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(5);
    const query = seen.listCalls[0] as {
      employeeId: string | null;
      from: Date;
      to: Date;
      errorOnly: boolean;
      offset: number;
    };
    expect(query.employeeId).toBeNull();
    expect(query.errorOnly).toBe(true);
    expect(query.offset).toBe(5);
    // 上海 10-13 00:00 = 2026-10-12T16:00Z；次日零点为 2026-10-13T16:00Z
    expect(query.from.toISOString()).toBe("2026-10-12T16:00:00.000Z");
    expect(query.to.toISOString()).toBe("2026-10-13T16:00:00.000Z");
  });

  it("每页条数上限 200（防止读模型被一次性拉爆）", async () => {
    const { repository, seen } = usageStub();
    const service = new ModelServiceUsageService(repository, () => NOW);

    const page = await service.listCalls(
      { employeeId: null },
      { pageSize: 9999 },
    );

    expect(page.pageSize).toBe(200);
    expect(seen.listCalls[0]).toMatchObject({ limit: 200 });
  });
});
