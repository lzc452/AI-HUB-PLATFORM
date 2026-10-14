import { describe, expect, it, afterEach } from "vitest";
import pg from "pg";

import {
  createDatabase,
  resolvePoolOptions,
  DATABASE_POOL_DEFAULTS,
} from "./database.js";

/**
 * P0-1 连接池门禁。
 *
 * 事故背景：建池时未监听 pool 的 `error` 事件。node-postgres 在没有
 * `error` 监听器时会让该事件变成**未捕获异常直接终止进程**。
 * 空闲连接被数据库或网络层断开是常态（PG 主备切换、容器网络抖动、
 * 云厂商连接保持超时），因此一次网络抖动就会让整个进程 crash；
 * 而 compose.production.yaml 的 worker 无副本，崩溃即 outbox 消费停摆。
 */
describe("连接池配置（P0-1）", () => {
  afterEach(() => {
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS;
    delete process.env.DATABASE_IDLE_TIMEOUT_MS;
    delete process.env.DATABASE_STATEMENT_TIMEOUT_MS;
  });

  it("默认参数提供超时兜底，不只是 max", () => {
    expect(DATABASE_POOL_DEFAULTS.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(DATABASE_POOL_DEFAULTS.idleTimeoutMillis).toBeGreaterThan(0);
    // statement_timeout 缺失时，一条写错的慢查询可以永久占住连接。
    expect(DATABASE_POOL_DEFAULTS.statementTimeoutMillis).toBeGreaterThan(0);
  });

  it("缺失环境变量时全部回落默认值", () => {
    expect(resolvePoolOptions({})).toEqual({ ...DATABASE_POOL_DEFAULTS });
  });

  it("合法环境变量覆盖默认值", () => {
    expect(
      resolvePoolOptions({
        DATABASE_POOL_MAX: "42",
        DATABASE_POOL_CONNECT_TIMEOUT_MS: "1500",
        DATABASE_IDLE_TIMEOUT_MS: "9000",
        DATABASE_STATEMENT_TIMEOUT_MS: "7000",
      }),
    ).toEqual({
      max: 42,
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 9000,
      statementTimeoutMillis: 7000,
    });
  });

  it("非法值回落默认值而不是抛错", () => {
    // 编排文件里手写错一个值不应该让服务起不来——
    // 连接池调优失败时退回已知可用值，远好过启动崩溃。
    for (const raw of ["abc", "0", "-1", "3.5", "NaN", "", "  "]) {
      expect(resolvePoolOptions({ DATABASE_POOL_MAX: raw }).max).toBe(
        DATABASE_POOL_DEFAULTS.max,
      );
    }
  });

  it("createDatabase 必须注册 error 监听器（防进程 crash）", async () => {
    // Kysely 把 pool 藏在 PostgresDriver 的私有字段里，取不到实例；
    // 改为拦截 pg.Pool.prototype.on，验证传入的实例确实带了 error 监听器。
    // 这比「检查配置项」更贴近真实风险——真正要保证的是
    // 「出错的连接不会变成未捕获异常」。
    const originalOn = pg.Pool.prototype.on;
    let captured: pg.Pool | undefined;
    pg.Pool.prototype.on = function patchedOn(
      this: pg.Pool,
      // pg.Pool#on 有重载签名，这里放宽以拦截任意事件名。
      event: string,
      listener: (...args: never[]) => void,
    ) {
      // 这里必须把 this 捕获到外部变量：断言要检查 pool 实例本身
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- 测试断言需要实例引用
      if (event === "error") captured = this;
      return originalOn.call(
        this,
        event as "error",
        listener as (error: Error) => void,
      ) as unknown as pg.Pool;
    } as typeof pg.Pool.prototype.on;

    const db = createDatabase("postgresql://user:pass@127.0.0.1:1/none");
    try {
      expect(
        captured,
        "createDatabase 未对连接池注册 error 监听器",
      ).toBeDefined();
      const pool = captured as pg.Pool;
      expect(pool.listenerCount("error")).toBeGreaterThanOrEqual(1);
      // 真正要保证的：触发 error 时事件被消化，不冒泡成未捕获异常。
      // 没有监听器时 EventEmitter 会 throw，这个断言直接覆盖该风险。
      expect(() => pool.emit("error", new Error("模拟主备切换"))).not.toThrow();
    } finally {
      pg.Pool.prototype.on = originalOn;
      await db.destroy().catch(() => undefined);
    }
  });
});
