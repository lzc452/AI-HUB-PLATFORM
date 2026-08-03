import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ArtifactPipeline } from "./storage.pipeline.js";
import { MemoryObjectStorage } from "./storage.memory.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const sha256 = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

function makePipeline(options?: {
  scan?: "clean" | "infected";
  signatureValid?: boolean;
}) {
  const storage = new MemoryObjectStorage();
  const pipeline = new ArtifactPipeline(storage, {
    async scan() {
      return options?.scan ?? "clean";
    },
    async verify() {
      return options?.signatureValid ?? true;
    },
  });
  return { pipeline, storage };
}

describe("ArtifactPipeline", () => {
  it("rejects missing or duplicate chunks before verification", async () => {
    const { pipeline } = makePipeline();
    await pipeline.putChunk("upload-1", 0, bytes("first"));
    await expect(
      pipeline.putChunk("upload-1", 0, bytes("duplicate")),
    ).rejects.toThrow("CHUNK_SEQUENCE_INVALID");

    await expect(
      pipeline.completeUpload({
        uploadId: "upload-1",
        expectedChunks: 2,
        objectKey: "applications/app-1/tmp.zip",
        finalObjectKey: "applications/app-1/1.0.0.zip",
        expectedSha256: sha256(bytes("firstsecond")),
        signature: "valid",
      }),
    ).rejects.toThrow("CHUNK_SEQUENCE_INVALID");
  });

  it("keeps a digest mismatch out of the final object", async () => {
    const { pipeline, storage } = makePipeline();
    await pipeline.putChunk("upload-2", 0, bytes("first"));
    await pipeline.putChunk("upload-2", 1, bytes("second"));

    await expect(
      pipeline.completeUpload({
        uploadId: "upload-2",
        expectedChunks: 2,
        objectKey: "applications/app-1/tmp.zip",
        finalObjectKey: "applications/app-1/1.0.0.zip",
        expectedSha256: "b".repeat(64),
        signature: "valid",
      }),
    ).resolves.toMatchObject({ accepted: false, reason: "DIGEST_MISMATCH" });
    await expect(
      storage.get("applications/app-1/1.0.0.zip"),
    ).resolves.toBeNull();
  });

  it("rejects infected or incorrectly signed artifacts", async () => {
    const infected = makePipeline({ scan: "infected" });
    await infected.pipeline.putChunk("upload-3", 0, bytes("payload"));
    await expect(
      infected.pipeline.completeUpload({
        uploadId: "upload-3",
        expectedChunks: 1,
        objectKey: "applications/app-1/tmp.zip",
        finalObjectKey: "applications/app-1/1.0.0.zip",
        expectedSha256: sha256(bytes("payload")),
        signature: "valid",
      }),
    ).resolves.toMatchObject({ accepted: false, reason: "MALWARE_DETECTED" });

    const invalidSignature = makePipeline({ signatureValid: false });
    await invalidSignature.pipeline.putChunk("upload-4", 0, bytes("payload"));
    await expect(
      invalidSignature.pipeline.completeUpload({
        uploadId: "upload-4",
        expectedChunks: 1,
        objectKey: "applications/app-1/tmp.zip",
        finalObjectKey: "applications/app-1/1.0.0.zip",
        expectedSha256: sha256(bytes("payload")),
        signature: "invalid",
      }),
    ).resolves.toMatchObject({ accepted: false, reason: "INVALID_SIGNATURE" });
  });

  it("copies only a clean, correctly signed artifact to the final key", async () => {
    const { pipeline, storage } = makePipeline();
    const payload = bytes("clean payload");
    await pipeline.putChunk("upload-5", 0, payload.slice(0, 5));
    await pipeline.putChunk("upload-5", 1, payload.slice(5));

    await expect(
      pipeline.completeUpload({
        uploadId: "upload-5",
        expectedChunks: 2,
        objectKey: "applications/app-1/tmp.zip",
        finalObjectKey: "applications/app-1/1.0.0.zip",
        expectedSha256: sha256(payload),
        signature: "valid",
      }),
    ).resolves.toMatchObject({ accepted: true, scanStatus: "passed" });
    await expect(storage.get("applications/app-1/1.0.0.zip")).resolves.toEqual(
      payload,
    );
    await expect(
      pipeline.verifyArtifact({
        artifactKey: "applications/app-1/1.0.0.zip",
        expectedSha256: sha256(payload),
        signature: "valid",
      }),
    ).resolves.toMatchObject({ accepted: true, scanStatus: "passed" });
    await expect(
      pipeline.verifyArtifact({
        artifactKey: "applications/app-1/1.0.0.zip",
        expectedSha256: sha256(payload),
        signature: "invalid",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      reason: "ARTIFACT_NOT_VERIFIED",
    });
  });
});
