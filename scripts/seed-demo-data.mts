import { createDatabase, seedDemoDataset, assertDemoDataSafety, resolveAnchorDate } from "@ai-hub/database";

const nodeEnv = process.env.NODE_ENV ?? "development";

assertDemoDataSafety({
  nodeEnv,
  demoDataEnabled: process.env.DEMO_DATA_ENABLED,
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const anchorDate = resolveAnchorDate(process.env.DEMO_ANCHOR_DATE);
const db = createDatabase(databaseUrl);

try {
  const result = await seedDemoDataset(db, {
    anchorDate,
    mode: "reset",
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(`Seed complete in ${result.durationMs}ms`);
} finally {
  await db.destroy();
}
