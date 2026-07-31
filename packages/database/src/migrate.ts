import { Migrator, type Kysely, type Migration } from "kysely";
import * as systemFoundation from "./migrations/0001_system_foundation.js";
import type { DatabaseSchema } from "./schema.js";

const migrations: Readonly<Record<string, Migration>> = {
  "0001_system_foundation": systemFoundation,
};

export async function runMigrations(db: Kysely<DatabaseSchema>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () => migrations,
    },
  });
  const { error } = await migrator.migrateToLatest();

  if (error !== undefined) {
    throw error;
  }
}
