import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertObjectStorageCutoverReady,
  createReplicationManifest,
  validateObjectStorageSettings,
} from "./object-storage-ops.mjs";

test("requires versioned encrypted private buckets and asynchronous replication", () => {
  assert.deepEqual(
    validateObjectStorageSettings({
      versioning: true,
      encryption: true,
      publicAccess: false,
      replicationMode: "async",
      manifestAlgorithm: "sha256",
      sourceBucket: "ai-hub-primary",
      targetBucket: "ai-hub-secondary",
    }),
    true,
  );
});

test("rejects public or unverified object-storage settings", () => {
  assert.throws(
    () =>
      validateObjectStorageSettings({
        versioning: false,
        encryption: false,
        publicAccess: true,
        replicationMode: "sync",
        manifestAlgorithm: "md5",
        sourceBucket: "ai-hub",
        targetBucket: "ai-hub",
      }),
    /versioning|encryption|public|async|sha256|different/i,
  );
});

test("creates a deterministic checksum manifest", () => {
  const manifest = createReplicationManifest([
    { key: "b.txt", versionId: "2", size: 2, etag: "etag-b" },
    { key: "a.txt", versionId: "1", size: 1, etag: "etag-a" },
  ]);

  assert.equal(manifest.algorithm, "sha256");
  assert.deepEqual(
    manifest.objects.map((object) => object.key),
    ["a.txt", "b.txt"],
  );
  assert.match(manifest.digest, /^[a-f0-9]{64}$/);
});

test("requires fencing and verified manifest before cutover", () => {
  assert.throws(
    () =>
      assertObjectStorageCutoverReady({
        sourceFenced: false,
        targetHealthy: true,
        manifestVerified: false,
        noConflicts: false,
      }),
    /fenc|manifest|conflict/i,
  );
});
