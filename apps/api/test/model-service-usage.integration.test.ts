import { randomUUID } from "node:crypto";
import {
  createDatabase,
  runMigrations,
  type DatabaseSchema,
} from "@ai-hub/database";
import {
  KyselyLlmUsageRepository,
  KyselyModelServiceKeyRepository,
  LlmUsageAggregator,
  ModelServiceUsageService,
  businessDayKey,
  businessDayStart,
  type LlmUsageRepository,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "0123456789abcdef0123456789abcdef";

/**
 * M4 退出条件的真库证据：聚合读模型的**幂等与重算**、业务日归属、三类查询、
 * 当日实时兜底、缺口扫描，以及管理面仓储（跨员工读取与状态变更）。
 *
 * 真实 vLLM 联调仍不在本文件范围内（见 PRD 4.3 A2）。
 */
describe("模型用量聚合与查询（真库）", () => {
  const suffix = randomUUID();
  const employeeId = `USAGE-${suffix}`.toUpperCase();
  const otherEmployeeId = `USAGE-OTHER-${suffix}`.toUpperCase();
  const departmentId = `usage-dept-${suffix}`;
  /** 固定「现在」：上海 2026-10-13 17:00 → 业务日 2026-10-13（DT-12 16:00Z ~ DT-13 16:00Z）。 */
  const NOW = new Date("2026-10-13T09:00:00.000Z");
  const TODAY = businessDayKey(NOW); // 2026-10-13
  const YESTERDAY = "2026-10-12";

  let db: Kysely<DatabaseSchema>;
  let stop: (() => Promise<void>) | undefined;
  let usageRepository: LlmUsageRepository;
  let aggregator: LlmUsageAggregator;
  let usageService: ModelServiceUsageService;
  let keyIds: { today: string; yesterday: string };

  async function seedKey(name: string) {
    const repo = new KyselyModelServiceKeyRepository(db);
    const inserted = await repo.insert({
      employeeId,
      name,
      keyPrefix: "sk-aihub-seedkeyx",
      keyHash: `hash-${name}-${suffix}`.slice(0, 64),
      rpmLimit: null,
      tpmLimit: null,
      dailyTokenLimit: null,
      expiresAt: null,
      rotatedFromKeyId: null,
    });
    return inserted.keyId;
  }

  async function insertCall(input: {
    keyId: string;
    requestedAt: Date;
    totalTokens: number;
    statusCode?: number;
    model?: string;
    employeeId?: string;
  }) {
    await db
      .insertInto("llm_api_call_logs")
      .values({
        key_id: input.keyId,
        employee_id: input.employeeId ?? employeeId,
        endpoint: "chat_completions",
        model: input.model ?? "Qwen3.5 35B A3B",
        stream: false,
        prompt_tokens: Math.floor(input.totalTokens / 2),
        completion_tokens: Math.ceil(input.totalTokens / 2),
        total_tokens: input.totalTokens,
        duration_ms: 100,
        status_code: input.statusCode ?? 200,
        error_code:
          input.statusCode !== undefined && input.statusCode >= 400
            ? "upstream_error"
            : null,
        usage_estimated: false,
        trace_id: null,
        requested_at: input.requestedAt,
      })
      .execute();
  }

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);

    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: "用量测试部门",
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values([
        {
          employee_id: employeeId,
          display_name: "用量测试员工",
          status: "active",
          primary_department_id: departmentId,
          password_hash: null,
          password_reset_required: false,
        },
        {
          employee_id: otherEmployeeId,
          display_name: "另一名员工",
          status: "active",
          primary_department_id: departmentId,
          password_hash: null,
          password_reset_required: false,
        },
      ])
      .execute();

    keyIds = {
      today: await seedKey("usage-today"),
      yesterday: await seedKey("usage-yesterday"),
    };
    usageRepository = new KyselyLlmUsageRepository(db);
    aggregator = new LlmUsageAggregator(usageRepository, { now: () => NOW });
    usageService = new ModelServiceUsageService(usageRepository, () => NOW);

    // 业务日 2026-10-13（上海）：3 条成功 + 1 条失败
    await insertCall({
      keyId: keyIds.today,
      requestedAt: new Date("2026-10-12T16:00:00Z"),
      totalTokens: 10,
    });
    await insertCall({
      keyId: keyIds.today,
      requestedAt: new Date("2026-10-13T02:00:00Z"),
      totalTokens: 20,
    });
    // 注意：时刻必须早于本文件固定的 NOW（= 上海 17:00）。网关自己记录的
    // requested_at 一定是请求开始时刻、不可能在未来；若把它写成「上海 23:59」，
    // 聚合（按业务日边界）会包含而实时兜底（按 to = now）会排除，两条口径就会对不上。
    await insertCall({
      keyId: keyIds.today,
      requestedAt: new Date("2026-10-13T08:30:00Z"),
      totalTokens: 30,
    });
    await insertCall({
      keyId: keyIds.today,
      requestedAt: new Date("2026-10-13T03:00:00Z"),
      totalTokens: 0,
      statusCode: 502,
    });
    // 业务日 2026-10-12：2 条
    await insertCall({
      keyId: keyIds.yesterday,
      requestedAt: new Date("2026-10-12T01:00:00Z"),
      totalTokens: 5,
    });
    await insertCall({
      keyId: keyIds.yesterday,
      requestedAt: new Date("2026-10-12T15:00:00Z"),
      totalTokens: 7,
    });
    // 边界：2026-10-12T16:00:00Z 属于 10-13（上面已覆盖），这里补一条属于 10-13 零点整的
    await insertCall({
      keyId: keyIds.today,
      requestedAt: new Date("2026-10-12T16:00:00Z"),
      totalTokens: 0,
      employeeId: otherEmployeeId,
    });
  }, 240_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("聚合写入读模型：按业务日归属，失败调用单独计数", async () => {
    const result = await aggregator.aggregateDay(TODAY);
    expect(result.usageDate).toBe(TODAY);

    const totals = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    // 10-13：10 + 20 + 30 + 0(502) + 0(另一员工) = 60，共 5 次调用、1 次失败
    expect(totals).toMatchObject({
      calls: 5,
      errorCalls: 1,
      totalTokens: 60,
    });
  });

  it("重复聚合不翻倍（delete-then-insert 幂等）", async () => {
    const before = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    await aggregator.aggregateDay(TODAY);
    await aggregator.aggregateDay(TODAY);
    const after = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    expect(after).toEqual(before);
  });

  it("新增调用后重算：读模型等于当前事实，而不是累加", async () => {
    await insertCall({
      keyId: keyIds.today,
      requestedAt: new Date("2026-10-13T08:00:00Z"),
      totalTokens: 100,
    });
    await aggregator.aggregateDay(TODAY);

    const totals = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    expect(totals).toMatchObject({ calls: 6, totalTokens: 160 });
  });

  it("业务日边界：上海零点前后分属不同业务日", async () => {
    await aggregator.aggregateDay(TODAY);
    await aggregator.aggregateDay(YESTERDAY);

    const todayTotals = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    const yesterdayTotals = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: YESTERDAY,
      toDate: YESTERDAY,
    });
    // 10-12 只有 5 + 7（01:00Z 与 15:00Z 都在上海 10-12 当天）
    expect(yesterdayTotals).toMatchObject({ calls: 2, totalTokens: 12 });
    // 10-13 不含 10-12T15:00Z 那条
    expect(todayTotals.totalTokens).toBe(160);
    expect(
      businessDayStart(new Date("2026-10-12T15:00:00Z")).toISOString(),
    ).toBe("2026-10-11T16:00:00.000Z");
  });

  it("三类查询：日趋势 / 按模型 / 按 Key（带 Key 名与状态）", async () => {
    await aggregator.aggregateDay(TODAY);
    await aggregator.aggregateDay(YESTERDAY);
    const range = {
      employeeId: null as string | null,
      fromDate: YESTERDAY,
      toDate: TODAY,
    };

    const daily = await usageRepository.listDailyTotals(range);
    expect(daily.map((row) => row.usageDate)).toEqual([YESTERDAY, TODAY]);

    const byModel = await usageRepository.listByModel(range);
    expect(byModel[0]).toMatchObject({
      model: "Qwen3.5 35B A3B",
      totalTokens: 172,
    });

    const byKey = await usageRepository.listByKey(range);
    const names = byKey.map((row) => row.keyName).sort();
    expect(names).toEqual(["usage-today", "usage-yesterday"]);
    expect(byKey.every((row) => row.keyStatus === "active")).toBe(true);
  });

  it("本人视角与管理面视角的数据权限不同（同一查询不同入参）", async () => {
    await aggregator.aggregateDay(TODAY);
    const mine = await usageRepository.sumDaily({
      employeeId,
      fromDate: TODAY,
      toDate: TODAY,
    });
    const other = await usageRepository.sumDaily({
      employeeId: otherEmployeeId,
      fromDate: TODAY,
      toDate: TODAY,
    });
    const all = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    expect(mine.totalTokens).toBe(160);
    expect(other.totalTokens).toBe(0);
    expect(all.totalTokens).toBe(160);
  });

  it("当日兜底：只聚合了昨天时，看板当日走事实表实时口径并标注", async () => {
    // 清掉今日读模型，模拟「worker 还没跑今天」
    await db
      .deleteFrom("llm_usage_daily")
      .where("usage_date", "=", TODAY)
      .execute();

    const summary = await usageService.getSummary({ employeeId: null }, {});

    expect(summary.todayPartial).toBe(true);
    expect(summary.totals.totalTokens).toBe(160);
    expect(summary.totals.calls).toBe(6);
    expect(summary.daily.at(-1)?.usageDate).toBe(TODAY);
  });

  it("缺口扫描：未聚合的日子会被列出，聚合后消失", async () => {
    const gapsBefore = await usageRepository.findUnaggregatedDays({
      lookbackDays: 30,
    });
    expect(gapsBefore).toContain(TODAY);

    await aggregator.aggregateDay(TODAY);
    const gapsAfter = await usageRepository.findUnaggregatedDays({
      lookbackDays: 30,
    });
    expect(gapsAfter).not.toContain(TODAY);
  });

  it("聚合器的自愈运行会把缺口补齐", async () => {
    await db
      .deleteFrom("llm_usage_daily")
      .where("usage_date", "=", TODAY)
      .execute();
    const result = await aggregator.run({ lookbackDays: 1, gapScanDays: 30 });

    expect(result.days.map((day) => day.usageDate)).toContain(TODAY);
    expect(result.skippedGaps).toBe(0);
    const totals = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    expect(totals.totalTokens).toBe(160);
  });

  it("管理面仓储：跨员工列表带归属人，状态变更不可复活已撤销 Key", async () => {
    const repository = new KyselyModelServiceKeyRepository(db);
    const listed = await repository.listAllWithOwner({
      employeeId,
      limit: 50,
      offset: 0,
    });
    expect(listed.items.length).toBeGreaterThanOrEqual(2);
    expect(listed.items[0]?.owner.displayName).toBe("用量测试员工");

    const target = listed.items[0]!;
    const disabled = await repository.updateStatusCasAnyOwner({
      keyId: target.keyId,
      expectedStatus: "active",
      nextStatus: "disabled",
      now: NOW,
    });
    expect(disabled?.status).toBe("disabled");

    // 撤销后不可再通过管理面状态变更复活（终态）
    await db
      .updateTable("llm_api_keys")
      .set({ status: "revoked" })
      .where("key_id", "=", target.keyId)
      .execute();
    await expect(
      repository.updateStatusCasAnyOwner({
        keyId: target.keyId,
        expectedStatus: "revoked",
        nextStatus: "active",
        now: NOW,
      }),
    ).resolves.toBeNull();
  });

  it("聚合与日配额口径一致（读模型 token 合计 = 事实表合计）", async () => {
    await aggregator.aggregateDay(TODAY);
    const aggregated = await usageRepository.sumDaily({
      employeeId: null,
      fromDate: TODAY,
      toDate: TODAY,
    });
    const live = await usageRepository.sumCallsLive({
      employeeId: null,
      from: businessDayStart(NOW),
      to: new Date(businessDayStart(NOW).getTime() + 24 * 60 * 60 * 1000),
    });
    expect(aggregated.totalTokens).toBe(live.totalTokens);
    expect(aggregated.calls).toBe(live.calls);
    expect(aggregated.errorCalls).toBe(live.errorCalls);
    // 顺带校验：密钥材料未泄露（本文件只断言用量的必要字段）
    expect(JSON.stringify(aggregated)).not.toContain(SECRET);
  });
});
