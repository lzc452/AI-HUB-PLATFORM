import { existsSync } from "node:fs";

// 本地开发时加载根目录 .env；生产环境由 Docker Compose 注入，.env 不存在则跳过
const envPath = "./.env";
if (existsSync(envPath)) process.loadEnvFile(envPath);

import {
  createDatabase,
  seedDemoBusinessData,
} from "../packages/database/src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed demo business data");
}

const database = createDatabase(databaseUrl);

try {
  const result = await seedDemoBusinessData(database);
  console.log(
    `Demo business data seeded: applications=${result.applications}, versions=${result.versions}, demands=${result.demands}, comments=${result.comments}, notifications=${result.notifications}, behaviorEvents=${result.behaviorEvents}`,
  );
} finally {
  await database.destroy();
}
