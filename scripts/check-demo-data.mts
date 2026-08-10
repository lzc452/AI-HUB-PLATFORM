import { createDatabase, checkDemoDataset, resolveAnchorDate } from "@ai-hub/database";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const anchorDate = resolveAnchorDate(process.env.DEMO_ANCHOR_DATE);
const db = createDatabase(databaseUrl);

try {
  const result = await checkDemoDataset(db, { anchorDate });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) {
    console.error(`Check FAILED: ${result.failures.length} failure(s)`);
    process.exit(1);
  }
  console.log(`Check passed in ${result.durationMs}ms`);
} finally {
  await db.destroy();
}
