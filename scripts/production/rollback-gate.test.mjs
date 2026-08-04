import assert from "node:assert/strict";
import test from "node:test";

import { validateRollbackPlan } from "./rollback-gate.mjs";

const validPlan = {
  previousImageDigests: [
    "registry.example/ai-hub-api@sha256:" + "1".repeat(64),
    "registry.example/ai-hub-worker@sha256:" + "2".repeat(64),
    "registry.example/ai-hub-web@sha256:" + "3".repeat(64),
  ],
  databaseRollbackMode: "forward-fix",
  backupId: "backup-2026-08-04T120000Z",
  restoreVerificationPath: "reports/restore-2026-08-04.json",
  approvalMarker: "approved-by-operations",
  dryRun: true,
  fencingRequired: true,
};

test("accepts a reversible application rollback plan", () => {
  assert.equal(validateRollbackPlan(validPlan), true);
});

test("rejects mutable rollback images and automatic database down-migrations", () => {
  assert.throws(
    () =>
      validateRollbackPlan({
        ...validPlan,
        previousImageDigests: ["registry.example/ai-hub-api:latest"],
        databaseRollbackMode: "down-migration",
        dryRun: false,
      }),
    /digest|forward-fix|dry-run/i,
  );
});
