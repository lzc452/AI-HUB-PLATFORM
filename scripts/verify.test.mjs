import assert from "node:assert/strict";
import { test } from "node:test";

import { runVerification, verificationCommands } from "./verify.mjs";

test("verification commands run in the required order", () => {
  assert.deepEqual(verificationCommands, [
    "pnpm format:check",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm boundaries",
    "pnpm test",
    "pnpm build",
    "node scripts/verify-doc-links.mjs",
    "docker compose -f compose.yaml -f compose.test.yaml config --quiet",
  ]);
});

test("verification stops at the first failing command", () => {
  const calls = [];
  const exitCode = runVerification((command) => {
    calls.push(command);
    return { status: command === verificationCommands[1] ? 7 : 0 };
  });

  assert.equal(exitCode, 7);
  assert.deepEqual(calls, verificationCommands.slice(0, 2));
});
