import assert from "node:assert/strict";
import { test } from "node:test";

import { createReleaseManifest } from "./release-manifest.mjs";

const validInput = {
  commitSha: "a".repeat(40),
  releaseTag: "v1.2.3",
  registry: "ghcr.io/lzc452/ai-hub-platform",
  imageDigests: {
    api: "sha256:" + "1".repeat(64),
    worker: "sha256:" + "2".repeat(64),
    web: "sha256:" + "3".repeat(64),
  },
  generatedAt: "2026-08-05T00:00:00.000Z",
};

test("creates an immutable release manifest for all runtime images", () => {
  assert.deepEqual(createReleaseManifest(validInput), {
    schemaVersion: 1,
    commitSha: validInput.commitSha,
    releaseTag: validInput.releaseTag,
    generatedAt: validInput.generatedAt,
    images: {
      api: {
        digest: validInput.imageDigests.api,
        ref: `${validInput.registry}/api@${validInput.imageDigests.api}`,
      },
      worker: {
        digest: validInput.imageDigests.worker,
        ref: `${validInput.registry}/worker@${validInput.imageDigests.worker}`,
      },
      web: {
        digest: validInput.imageDigests.web,
        ref: `${validInput.registry}/web@${validInput.imageDigests.web}`,
      },
    },
    attestations: {
      sbom: "BuildKit SBOM attestation attached to each image digest",
      provenance:
        "BuildKit provenance attestation attached to each image digest",
    },
  });
});

test("rejects mutable release tags and incomplete image digests", () => {
  assert.throws(
    () =>
      createReleaseManifest({
        ...validInput,
        releaseTag: "latest",
        imageDigests: { ...validInput.imageDigests, web: "latest" },
      }),
    /release tag|digest/i,
  );
});
