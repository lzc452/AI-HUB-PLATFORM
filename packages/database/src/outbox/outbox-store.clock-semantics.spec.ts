import { createDatabase, runMigrations } from "@ai-hub/database";
import { OutboxStore } from "./outbox-store.js";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * outbox 的 `available_at` 时钟基准门禁。
 *
 * ## 缺陷（phase6 长期失败的真正根因）
 *
 * claim 的候选条件写作 `available_at <= now()`（PostgreSQL 时钟），
 * 而写入方用**应用侧** `new Date()` 填 `available_at`。
 * 写入与判断分属两套时钟基准 —— 本机容器实测偏差约 25 秒
 * （应用时钟快于数据库时钟），于是：
 *
 * - 应用侧看：`available_at` 已过期 ✅
 * - 数据库看：`available_at` 仍在未来 ⏳ → 被 `available_at <= now()` 排除
 *
 * 后果：事件被**永久**跳过 —— outbox 行一直 `pending`、`attempts` 恒为 0、
 * 通知永不投递，且**不产生任何错误**。不是偶发抖动，是确定性缺陷。
 *
 * ## 修复
 *
 * 1. 写入侧统一用数据库时钟 `now()`（9 处 emitOutbox / append），
 *    与 claim 的基准天然一致；
 * 2. claim 侧改用 `clock_timestamp()`（真实当前时间），
 *    避免同一事务内 `now()` 固定在事务开始时刻。
 *
 * ## 本门禁如何真正区分两者
 *
 * 用「显式相对数据库时钟的偏移」构造，并断言 claim 的行为与
 * **数据库时钟**一致；若claim 内部换成应用时钟，结论立刻改变。
 */
describe("outbox 的 available_at 时钟基准", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let store: OutboxStore;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    store = new OutboxStore(db);
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  }, 60_000);

  /** 用数据库时钟插入事件；offsetMs 为相对数据库当前时刻的毫秒偏移。 */
  async function insertWithDbClock(
    key: string,
    offsetMs: number,
  ): Promise<void> {
    await sql`
      insert into outbox_events
        (event_type, aggregate_type, aggregate_id, payload, idempotency_key,
         status, attempts, available_at)
      values ('probe', 'probe', ${key}, '{}'::jsonb, ${key}, 'pending', 0,
              clock_timestamp() + (${offsetMs} * interval '1 millisecond'))
    `.execute(db);
  }

  it("available_at 已过的事件被 claim", async () => {
    await insertWithDbClock("clock-past", -1000);
    const claimed = await store.claim(1, "clock-worker");
    expect(claimed.map((event) => event.idempotencyKey)).toContain(
      "clock-past",
    );
  }, 60_000);

  it("available_at 明确在未来的事件被推迟（延迟投递不被破坏）", async () => {
    await insertWithDbClock("clock-future", 60_000);
    const claimed = await store.claim(1, "clock-worker");
    expect(claimed.map((event) => event.idempotencyKey)).not.toContain(
      "clock-future",
    );
  }, 60_000);

  it("available_at 刚好到期的事件在时钟推进后必然被 claim", async () => {
    // 回归点：offset 压到 5ms，让「到期判定」落在时钟边界上。
    // 循环 10 轮，任何一轮拿不到都说明 claim 又退回了跨时钟比较。
    for (let round = 0; round < 10; round++) {
      const key = `clock-edge-${round}`;
      await insertWithDbClock(key, 5);
      await sql`select pg_sleep(0.02)`.execute(db);
      const claimed = await store.claim(1, "clock-worker");
      expect(
        claimed.map((event) => event.idempotencyKey),
        `第 ${round} 轮：available_at 已过期却没被 claim`,
      ).toContain(key);
    }
  }, 60_000);

  it("省略 available_at 时默认值来自数据库时钟", async () => {
    // 守住「写入侧统一用数据库时钟」这个约定：
    // 生产代码应省略该列让数据库填，而不是用应用侧 new Date()。
    const before = await sql<{ t: Date }>`
      select clock_timestamp() as t
    `.execute(db);
    const dbBefore = new Date(before.rows[0]?.t as Date).getTime();

    await sql`
      insert into outbox_events
        (event_type, aggregate_type, aggregate_id, payload, idempotency_key,
         status, attempts)
      values ('probe', 'probe', 'probe-default', '{}'::jsonb,
              'probe-default-at', 'pending', 0)
    `.execute(db);

    const row = await sql<{ available_at: Date }>`
      select available_at from outbox_events
      where idempotency_key = 'probe-default-at'
    `.execute(db);
    const availableAt = new Date(row.rows[0]?.available_at as Date).getTime();

    expect(
      Math.abs(availableAt - dbBefore),
      "available_at 默认值应来自数据库时钟（与应用时钟可能有数十秒偏差）",
    ).toBeLessThan(5_000);
  }, 60_000);
});
