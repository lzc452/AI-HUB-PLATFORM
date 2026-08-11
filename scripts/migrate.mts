import { existsSync } from "node:fs";

// 本地开发时加载根目录 .env；生产环境由 Docker Compose 注入，.env 不存在则跳过
const envPath = "./.env";
if (existsSync(envPath)) process.loadEnvFile(envPath);

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
