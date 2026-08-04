import assert from "node:assert/strict";
import test from "node:test";

import { validateRecoveryDrillEvidence } from "./drill-ops.mjs";

const boundedEvidence = {
  drillId: "phase-07-2026-08-04-001",
  scenario: "postgres-failure",
  startedAt: "2026-08-04T12:00:00.000Z",
  endedAt: "2026-08-04T12:12:00.000Z",
  rpoSeconds: 420,
  rtoSeconds: 720,
  fencingVerified: true,
  restoreVerified: true,
  events: [
    { type: "failure-injected", at: "2026-08-04T12:00:00.000Z" },
    { type: "standby-promoted", at: "2026-08-04T12:05:00.000Z" },
    { type: "writes-restored", at: "2026-08-04T12:12:00.000Z" },
  ],
};

test("rejects incomplete recovery evidence and SLO breaches", () => {
  assert.throws(
    () =>
      validateRecoveryDrillEvidence({
        ...boundedEvidence,
        rpoSeconds: 901,
        fencingVerified: false,
        restoreVerified: false,
      }),
    /RPO|fencing|restore/i,
  );
});

test("accepts bounded evidence for a database failure drill", () => {
  assert.deepEqual(validateRecoveryDrillEvidence(boundedEvidence), {
    ok: true,
    rpoSeconds: 420,
    rtoSeconds: 720,
  });
});

test("rejects non-monotonic events and missing cutover evidence", () => {
  assert.throws(
    () =>
      validateRecoveryDrillEvidence({
        ...boundedEvidence,
        scenario: "dns-cutover",
        events: [
          { type: "failure-injected", at: "2026-08-04T12:00:00.000Z" },
          { type: "writes-restored", at: "2026-08-04T12:12:00.000Z" },
          { type: "dns-cutover", at: "2026-08-04T12:05:00.000Z" },
        ],
      }),
    /chronological|cutover/i,
  );
});

test("requires the object-storage drill to prove a checksum-verified restore", () => {
  assert.throws(
    () =>
      validateRecoveryDrillEvidence({
        ...boundedEvidence,
        scenario: "object-storage-failure",
        restoreVerified: false,
        events: [
          { type: "failure-injected", at: "2026-08-04T12:00:00.000Z" },
          { type: "object-storage-cutover", at: "2026-08-04T12:05:00.000Z" },
          { type: "writes-restored", at: "2026-08-04T12:12:00.000Z" },
        ],
      }),
    /restore/i,
  );
});
