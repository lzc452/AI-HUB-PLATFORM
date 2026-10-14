import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DatabaseSchema } from "./schema.js";

/**
 * 连接池默认参数。
 *
 * `max: 10` 是历史遗留的硬编码值：它在本地开发足够，但在生产有两个问题——
 * 一是**不随环境变化**，压测或并发高峰时成为吞吐天花板；
 * 二是没有任何超时兜底，一条卡死的连接可以永久占用池位，
 * 最终表现为「连接池耗尽」而非明确的超时错误。
 *
 * `statement_timeout` 是PG 侧的兜底：它保证单条语句不会无限执行。
 * 没有它，一条写错的递归查询能把连接占住到天荒地老。
 */
export const DATABASE_POOL_DEFAULTS = Object.freeze({
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statementTimeoutMillis: 30_000,
});

export interface DatabasePoolOptions {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
}

/**
 * 解析正整数环境变量，非法或缺失时回落到默认值。
 *
 * **必须回落而不是抛错**：容器编排里一个手写的 `DATABASE_POOL_MAX=abc`
 * 不应该让整个服务起不来——连接池参数调优失败时退回已知可用值，
 * 远好过启动崩溃。但也要留痕，否则「我明明配了 20 怎么没生效」无从查起。
 */
function readPositiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `[database] ${name}=${JSON.stringify(raw)} 不是正整数，回落到 ${fallback}`,
    );
    return fallback;
  }
  return parsed;
}

/**
 * 从环境变量解析连接池参数。导出以便单元测试直接覆盖各种非法输入。
 */
export function resolvePoolOptions(
  env: NodeJS.ProcessEnv = process.env,
): DatabasePoolOptions {
  return {
    max: readPositiveInteger(
      env.DATABASE_POOL_MAX,
      DATABASE_POOL_DEFAULTS.max,
      "DATABASE_POOL_MAX",
    ),
    connectionTimeoutMillis: readPositiveInteger(
      env.DATABASE_POOL_CONNECT_TIMEOUT_MS,
      DATABASE_POOL_DEFAULTS.connectionTimeoutMillis,
      "DATABASE_POOL_CONNECT_TIMEOUT_MS",
    ),
    idleTimeoutMillis: readPositiveInteger(
      env.DATABASE_IDLE_TIMEOUT_MS,
      DATABASE_POOL_DEFAULTS.idleTimeoutMillis,
      "DATABASE_IDLE_TIMEOUT_MS",
    ),
    statementTimeoutMillis: readPositiveInteger(
      env.DATABASE_STATEMENT_TIMEOUT_MS,
      DATABASE_POOL_DEFAULTS.statementTimeoutMillis,
      "DATABASE_STATEMENT_TIMEOUT_MS",
    ),
  };
}

/**
 * 创建数据库句柄。
 *
 * **关键：必须监听 pool 的 `error` 事件。**
 * node-postgres（以及几乎所有 EventEmitter）在没有 `error` 监听器时会**直接
 * 抛出未捕获异常终止进程**。而空闲连接被数据库或网络层断开是会常态发生的
 * ——PG 主备切换、容器网络抖动、云厂商连接保持超时都会触发。
 * 没有这个监听器，一次网络抖动就是整个进程 crash；
 * 而 worker 是单服务无副本，崩溃即outbox 消费停摆。
 */
export function createDatabase(databaseUrl: string) {
  const options = resolvePoolOptions();
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.max,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    idleTimeoutMillis: options.idleTimeoutMillis,
    // 通过连接参数而非 SQL 生效，覆盖该连接上的所有语句。
    statement_timeout: options.statementTimeoutMillis,
  });

  // 空连接错误（网络抖动/主备切换/云厂商回收）只记录不抛出。
  // 池会自行丢弃坏连接并补建新连接，业务侧感知为一次短暂失败，
  // 而不是一个直接终止进程的未捕获异常。
  pool.on("error", (error: Error) => {
    console.error(
      `[database] 空闲连接错误（已忽略，池会自动重建连接）: ${error.message}`,
    );
  });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}
