import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  applyPortalAppReconciliationPlans,
  collectPortalAppReconciliationPlans,
  createDatabase,
  isPortalAppPlanRepairable,
  rollbackPortalAppReconciliationBatch,
} from "../packages/database/src/index.js";

type Command =
  | { mode: "dry-run" }
  | { mode: "apply"; expectedCount: number }
  | { mode: "rollback"; batchId: string };

export function parsePortalAppReconciliationCommand(
  args: readonly string[],
): Command {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) {
    return { mode: "dry-run" };
  }
  if (args[0] === "--apply" && args[1] === "--expected-count" && args[2]) {
    const expectedCount = Number(args[2]);
    if (
      args.length === 3 &&
      Number.isSafeInteger(expectedCount) &&
      expectedCount >= 0
    ) {
      return { mode: "apply", expectedCount };
    }
  }
  if (args[0] === "--rollback-batch" && args.length === 2 && args[1]) {
    return { mode: "rollback", batchId: args[1] };
  }
  throw new Error(
    "用法：--dry-run | --apply --expected-count N | --rollback-batch <batchId>",
  );
}

async function main(): Promise<void> {
  // 本地开发时加载根目录 .env；生产环境由部署系统注入且不会自动执行本脚本。
  if (existsSync("./.env")) process.loadEnvFile("./.env");
  const command = parsePortalAppReconciliationCommand(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("缺少必需的 DATABASE_URL");
  const database = createDatabase(databaseUrl);
  try {
    if (command.mode === "rollback") {
      const result = await rollbackPortalAppReconciliationBatch(
        database,
        command.batchId,
      );
      console.log(
        JSON.stringify(
          { mode: command.mode, batchId: command.batchId, ...result },
          null,
          2,
        ),
      );
      return;
    }
    const plans = await collectPortalAppReconciliationPlans(database);
    if (command.mode === "dry-run") {
      console.log(
        JSON.stringify(
          {
            mode: command.mode,
            findings: plans,
            repairableCount: plans.filter(isPortalAppPlanRepairable).length,
            manualReviewCount: plans.filter(
              (plan) => plan.manualReasons.length > 0,
            ).length,
          },
          null,
          2,
        ),
      );
      return;
    }
    const result = await applyPortalAppReconciliationPlans(
      database,
      plans,
      command.expectedCount,
    );
    console.log(
      JSON.stringify(
        { mode: command.mode, expectedCount: command.expectedCount, ...result },
        null,
        2,
      ),
    );
  } finally {
    await database.destroy();
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  await main();
}
