import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { MemoryObjectStorage } from "./storage.memory.js";
import { ArtifactVerificationWorker } from "./artifact-verification.worker.js";
import type { ArtifactUploadRecord } from "./application.types.js";
import type { KyselyApplicationRepository } from "./application.repository.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const digest = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

function makeUpload(overrides: Partial<ArtifactUploadRecord> = {}) {
  const content = bytes("artifact payload");
  return {
    content,
    upload: {
      applicationId: "app-1",
      completedAt: null,
      createdAt: new Date("2026-08-14T00:00:00Z"),
      errorCode: null,
      expiresAt: new Date("2026-08-15T00:00:00Z"),
      fileName: "artifact.zip",
      mimeType: "application/zip",
      objectKey: "applications/app-1/uploads/upload-1/content",
      partCount: 1,
      scanStatus: "pending" as const,
      sha256: digest(content),
      signature: null,
      sizeBytes: content.byteLength,
      stagingObjectKey: "applications/app-1/uploads/upload-1/content",
      uploadId: "upload-1",
      uploadedByEmployeeId: "employee-1",
      uploadStatus: "verifying" as const,
      verificationAttempts: 1,
      verificationStartedAt: new Date("2026-08-14T00:01:00Z"),
      ...overrides,
    } satisfies ArtifactUploadRecord,
  };
}

function makeRepository(upload: ArtifactUploadRecord) {
  const audits: unknown[] = [];
  const outbox: unknown[] = [];
  const repository = {
    async findArtifactUpload() {
      return upload;
    },
    async withTransaction<T>(operation: (repo: unknown) => Promise<T>) {
      return operation(repository);
    },
    async finalizeArtifactVerification(input: {
      objectKey: string;
      signature: string;
    }) {
      if (upload.uploadStatus !== "verifying") return null;
      Object.assign(upload, {
        completedAt: new Date(),
        objectKey: input.objectKey,
        scanStatus: "passed",
        signature: input.signature,
        uploadStatus: "completed",
      });
      return upload;
    },
    async failArtifactVerification(input: { errorCode: string }) {
      if (upload.uploadStatus !== "verifying") return null;
      Object.assign(upload, {
        errorCode: input.errorCode,
        scanStatus: "failed",
        uploadStatus: "failed",
      });
      return upload;
    },
    async recordAudit(input: unknown) {
      audits.push(input);
    },
    async emitOutbox(input: unknown) {
      outbox.push(input);
      return true;
    },
    audits,
    outbox,
  } as unknown as KyselyApplicationRepository & {
    audits: unknown[];
    outbox: unknown[];
  };
  return repository;
}

describe("ArtifactVerificationWorker", () => {
  it("verifies, finalizes and removes staging content", async () => {
    const { content, upload } = makeUpload();
    const stagingKey = upload.objectKey;
    const repository = makeRepository(upload);
    const storage = new MemoryObjectStorage();
    await storage.put(upload.objectKey, content);
    const worker = new ArtifactVerificationWorker({
      repository,
      scanner: { scan: async () => "clean" },
      signer: { sign: async () => "sig" },
      storage,
      verifier: { verify: async (_content, signature) => signature === "sig" },
    });

    await expect(worker.verify(upload.uploadId)).resolves.toMatchObject({
      objectKey: "applications/app-1/artifacts/upload-1/content",
      scanStatus: "passed",
      signature: "sig",
      uploadStatus: "completed",
    });
    await expect(storage.get(stagingKey)).resolves.toBeNull();
    expect(repository.audits).toHaveLength(1);
    expect(repository.outbox).toHaveLength(1);
  });

  it("fails closed on malware and never publishes a final object", async () => {
    const { content, upload } = makeUpload();
    const repository = makeRepository(upload);
    const storage = new MemoryObjectStorage();
    await storage.put(upload.objectKey, content);
    const worker = new ArtifactVerificationWorker({
      repository,
      scanner: { scan: async () => "infected" },
      storage,
      verifier: { verify: async () => true },
    });

    await expect(worker.verify(upload.uploadId)).resolves.toBeNull();
    expect(upload.uploadStatus).toBe("failed");
    expect(upload.errorCode).toBe("MALWARE_DETECTED");
    await expect(
      storage.get("applications/app-1/artifacts/upload-1/content"),
    ).resolves.toBeNull();
    expect(repository.outbox).toHaveLength(1);
  });

  it.each([
    ["DIGEST_MISMATCH", async () => "clean" as const],
    [
      "ARTIFACT_SECURITY_UNAVAILABLE",
      async () => {
        throw new Error("CLAMAV_TIMEOUT");
      },
    ],
  ])(
    "records %s and never creates a final object",
    async (errorCode, scanner) => {
      const { content, upload } = makeUpload(
        errorCode === "DIGEST_MISMATCH" ? { sha256: "wrong-digest" } : {},
      );
      const repository = makeRepository(upload);
      const storage = new MemoryObjectStorage();
      await storage.put(upload.objectKey, content);
      const worker = new ArtifactVerificationWorker({
        repository,
        scanner: { scan: scanner },
        storage,
        verifier: { verify: async () => true },
      });

      await expect(worker.verify(upload.uploadId)).resolves.toBeNull();
      expect(upload.uploadStatus).toBe("failed");
      expect(upload.errorCode).toBe(errorCode);
      await expect(
        storage.get("applications/app-1/artifacts/upload-1/content"),
      ).resolves.toBeNull();
    },
  );

  it("fails closed on an invalid signature before copying the final object", async () => {
    const { content, upload } = makeUpload();
    const repository = makeRepository(upload);
    const storage = new MemoryObjectStorage();
    await storage.put(upload.objectKey, content);
    const worker = new ArtifactVerificationWorker({
      repository,
      scanner: { scan: async () => "clean" },
      signer: { sign: async () => "generated-signature" },
      storage,
      verifier: { verify: async () => false },
    });

    await expect(worker.verify(upload.uploadId)).resolves.toBeNull();
    expect(upload.errorCode).toBe("INVALID_SIGNATURE");
    await expect(
      storage.get("applications/app-1/artifacts/upload-1/content"),
    ).resolves.toBeNull();
  });

  it("marks copy failures as STORAGE_FINALIZE_FAILED and preserves staging for retry inspection", async () => {
    const { content, upload } = makeUpload();
    const repository = makeRepository(upload);
    const memory = new MemoryObjectStorage();
    await memory.put(upload.objectKey, content);
    const storage = {
      copy: async () => {
        throw new Error("GARAGE_COPY_FAILED");
      },
      delete: memory.delete.bind(memory),
      get: memory.get.bind(memory),
      put: memory.put.bind(memory),
    };
    const worker = new ArtifactVerificationWorker({
      repository,
      scanner: { scan: async () => "clean" },
      signer: { sign: async () => "generated-signature" },
      storage,
      verifier: { verify: async () => true },
    });

    await expect(worker.verify(upload.uploadId)).resolves.toBeNull();
    expect(upload.errorCode).toBe("STORAGE_FINALIZE_FAILED");
    await expect(storage.get(upload.objectKey)).resolves.toEqual(content);
  });

  it("requeues stale verification with audit and outbox evidence", async () => {
    const { upload } = makeUpload();
    const repository = makeRepository(upload);
    const staleRepository = repository as KyselyApplicationRepository & {
      listStaleArtifactVerifications: (input: {
        limit: number;
        olderThan: Date;
      }) => Promise<readonly ArtifactUploadRecord[]>;
      resetStaleArtifactVerification: (uploadId: string) => Promise<boolean>;
    };
    staleRepository.listStaleArtifactVerifications = async () => [upload];
    staleRepository.resetStaleArtifactVerification = async () => {
      upload.uploadStatus = "uploading";
      upload.verificationStartedAt = null;
      return true;
    };
    const worker = new ArtifactVerificationWorker({
      repository,
      scanner: { scan: async () => "clean" },
      storage: new MemoryObjectStorage(),
      verifier: { verify: async () => true },
    });

    await expect(
      worker.reconcileStale(new Date("2026-08-15T00:00:00Z")),
    ).resolves.toBe(1);
    expect(upload.uploadStatus).toBe("uploading");
    expect(repository.audits).toHaveLength(1);
    expect(repository.outbox).toEqual([
      expect.objectContaining({ eventType: "artifact.verification.requested" }),
    ]);
  });
});
