import type { Kysely } from "kysely";

import { createDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

/**
 * 单进程数据库运行时：由 composition root 创建并负责关闭，feature module
 * 只接收同一个 Kysely 实例，不再自行创建连接池。
 */
export interface DatabaseRuntime {
  readonly database: Kysely<DatabaseSchema>;
  withTransaction<T>(
    operation: (database: Kysely<DatabaseSchema>) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

export function createDatabaseRuntime(databaseUrl: string): DatabaseRuntime {
  return createDatabaseRuntimeFrom(createDatabase(databaseUrl));
}

export function createDatabaseRuntimeFrom(
  database: Kysely<DatabaseSchema>,
): DatabaseRuntime {
  return {
    database,
    withTransaction: (operation) =>
      database.transaction().execute((transaction) => operation(transaction)),
    close: () => database.destroy(),
  };
}
