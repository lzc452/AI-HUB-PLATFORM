import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DatabaseSchema } from "./schema.js";

export function createDatabase(databaseUrl: string) {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: databaseUrl,
        max: 10,
        connectionTimeoutMillis: 5_000,
      }),
    }),
  });
}
