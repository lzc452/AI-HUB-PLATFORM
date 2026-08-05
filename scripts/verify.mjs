import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const verificationCommands = Object.freeze([
  "pnpm format:check",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm boundaries",
  "pnpm test",
  "pnpm build",
  "node scripts/verify-doc-links.mjs",
  "node scripts/repository-governance.mjs",
  "docker compose -f compose.yaml -f compose.test.yaml config --quiet",
]);

export function runVerification(run = spawnSync) {
  for (const command of verificationCommands) {
    const result = run(command, {
      shell: true,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runVerification();
}
