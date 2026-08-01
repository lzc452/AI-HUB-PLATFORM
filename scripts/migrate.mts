import {
  createDatabase,
  runMigrations,
} from "../packages/database/src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const database = createDatabase(databaseUrl);

try {
  await runMigrations(database);
} finally {
  await database.destroy();
}
