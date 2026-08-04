import { createHash } from "node:crypto";

/**
 * @typedef {object} ObjectStorageCutoverReadiness
 * @property {boolean} sourceFenced
 * @property {boolean} targetHealthy
 * @property {boolean} manifestVerified
 * @property {boolean} noConflicts
 */

export function validateObjectStorageSettings(settings) {
  const errors = [];
  if (settings.versioning !== true) errors.push("versioning must be enabled");
  if (settings.encryption !== true) errors.push("encryption must be enabled");
  if (settings.publicAccess !== false)
    errors.push("public access must be disabled");
  if (settings.replicationMode !== "async")
    errors.push("replication must be async");
  if (settings.manifestAlgorithm !== "sha256")
    errors.push("manifest must use sha256");
  if (
    !settings.sourceBucket ||
    !settings.targetBucket ||
    settings.sourceBucket === settings.targetBucket
  ) {
    errors.push("source and target buckets must be different");
  }
  if (errors.length > 0)
    throw new Error(`Invalid object-storage settings: ${errors.join("; ")}`);
  return true;
}

export function createReplicationManifest(objects) {
  const sorted = [...objects].sort((left, right) =>
    `${left.key}\u0000${left.versionId}`.localeCompare(
      `${right.key}\u0000${right.versionId}`,
    ),
  );
  const canonical = sorted.map((object) => ({
    key: object.key,
    versionId: object.versionId,
    size: object.size,
    etag: object.etag,
  }));
  const digest = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  return { algorithm: "sha256", digest, objects: canonical };
}

/** @param {ObjectStorageCutoverReadiness} input */
export function assertObjectStorageCutoverReady(input) {
  if (!input.sourceFenced) throw new Error("OBJECT_SOURCE_FENCING_REQUIRED");
  if (!input.targetHealthy) throw new Error("OBJECT_TARGET_UNHEALTHY");
  if (!input.manifestVerified) throw new Error("OBJECT_MANIFEST_UNVERIFIED");
  if (!input.noConflicts) throw new Error("OBJECT_REPLICATION_CONFLICT");
  return true;
}
