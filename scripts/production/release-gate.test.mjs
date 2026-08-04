import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateMigrationPlan,
  validateReleaseMetadata,
  validateSupplyChainReport,
} from "./release-gate.mjs";

const valid = {
  commitSha: "a".repeat(40),
  imageDigests: [
    "registry.example/ai-hub-api@sha256:" + "1".repeat(64),
    "registry.example/ai-hub-worker@sha256:" + "2".repeat(64),
    "registry.example/ai-hub-web@sha256:" + "3".repeat(64),
  ],
  sbomPath: "reports/sbom.json",
  provenancePath: "reports/provenance.json",
  releaseMarker: "release-2026-08-04",
  rollbackMarker: "rollback-2026-08-04",
};

test("accepts a release with commit/digest/SBOM/provenance and rollback markers", () => {
  assert.deepEqual(validateReleaseMetadata(valid), []);
});

test("rejects mutable images and missing artifact evidence", () => {
  assert.throws(
    () =>
      validateReleaseMetadata({
        ...valid,
        imageDigests: ["registry.example/ai-hub-api:latest"],
        sbomPath: "",
        rollbackMarker: "",
      }),
    /digest|SBOM|rollback/i,
  );
});

test("rejects destructive or non-forward-compatible migration plans", () => {
  assert.throws(
    () =>
      validateMigrationPlan({
        migrationNames: ["0013_drop_users"],
        forwardCompatible: false,
      }),
    /migration|compatible|destructive/i,
  );
  assert.deepEqual(
    validateMigrationPlan({
      migrationNames: ["0012_request_replay_nonces"],
      forwardCompatible: true,
    }),
    [],
  );
});

test("rejects unsigned supply-chain reports or critical vulnerabilities", () => {
  assert.throws(
    () =>
      validateSupplyChainReport({
        signed: false,
        critical: 0,
        high: 0,
        source: "registry",
      }),
    /signed/i,
  );
  assert.throws(
    () =>
      validateSupplyChainReport({
        signed: true,
        critical: 1,
        high: 0,
        source: "registry",
      }),
    /critical/i,
  );
});
