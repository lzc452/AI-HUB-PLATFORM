import { createHash } from "node:crypto";
import type {
  ArtifactVerificationResult,
  MalwareScannerPort,
  ObjectStoragePort,
  SignatureVerifierPort,
  ArtifactVerificationPort,
} from "./storage.port.js";

interface UploadState {
  chunks: Map<number, Uint8Array>;
}

export class ArtifactPipeline implements ArtifactVerificationPort {
  private readonly uploads = new Map<string, UploadState>();
  private readonly verifications = new Map<
    string,
    ArtifactVerificationResult
  >();
  private readonly verifiedSignatures = new Map<string, string>();

  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly security: MalwareScannerPort & SignatureVerifierPort,
  ) {}

  async putChunk(
    uploadId: string,
    chunkIndex: number,
    content: Uint8Array,
  ): Promise<void> {
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      throw new Error("CHUNK_SEQUENCE_INVALID");
    }
    const upload = this.uploads.get(uploadId) ?? { chunks: new Map() };
    if (upload.chunks.has(chunkIndex)) {
      throw new Error("CHUNK_SEQUENCE_INVALID");
    }
    upload.chunks.set(chunkIndex, content.slice());
    this.uploads.set(uploadId, upload);
  }

  async completeUpload(input: {
    uploadId: string;
    expectedChunks: number;
    objectKey: string;
    finalObjectKey: string;
    expectedSha256: string;
    signature: string;
  }): Promise<ArtifactVerificationResult> {
    const upload = this.uploads.get(input.uploadId);
    if (
      upload === undefined ||
      !Number.isInteger(input.expectedChunks) ||
      input.expectedChunks < 1 ||
      upload.chunks.size !== input.expectedChunks ||
      [...Array(input.expectedChunks).keys()].some(
        (index) => !upload.chunks.has(index),
      )
    ) {
      throw new Error("CHUNK_SEQUENCE_INVALID");
    }

    const content = Buffer.concat(
      [...upload.chunks.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, chunk]) => Buffer.from(chunk)),
    );
    const sha256 = createHash("sha256").update(content).digest("hex");
    await this.storage.put(input.objectKey, content);

    if (sha256 !== input.expectedSha256) {
      await this.storage.delete(input.objectKey);
      this.uploads.delete(input.uploadId);
      return {
        accepted: false,
        scanStatus: "failed",
        sha256,
        reason: "DIGEST_MISMATCH",
      };
    }

    if ((await this.security.scan(content)) === "infected") {
      await this.storage.delete(input.objectKey);
      this.uploads.delete(input.uploadId);
      return {
        accepted: false,
        scanStatus: "failed",
        sha256,
        reason: "MALWARE_DETECTED",
      };
    }

    if (!(await this.security.verify(content, input.signature))) {
      await this.storage.delete(input.objectKey);
      this.uploads.delete(input.uploadId);
      return {
        accepted: false,
        scanStatus: "failed",
        sha256,
        reason: "INVALID_SIGNATURE",
      };
    }

    await this.storage.copy(input.objectKey, input.finalObjectKey);
    await this.storage.delete(input.objectKey);
    this.uploads.delete(input.uploadId);
    const result = { accepted: true, scanStatus: "passed", sha256 } as const;
    this.verifications.set(input.finalObjectKey, result);
    this.verifiedSignatures.set(input.finalObjectKey, input.signature);
    return result;
  }

  async verifyArtifact(input: {
    artifactKey: string;
    expectedSha256: string;
    signature: string;
  }): Promise<ArtifactVerificationResult> {
    const result = this.verifications.get(input.artifactKey);
    if (
      result === undefined ||
      result.sha256 !== input.expectedSha256 ||
      this.verifiedSignatures.get(input.artifactKey) !== input.signature
    ) {
      return {
        accepted: false,
        scanStatus: "failed",
        sha256: result?.sha256 ?? "",
        reason: "ARTIFACT_NOT_VERIFIED",
      };
    }
    return result;
  }

  /** 扫描已落盘的资产内容（用于把资产置为 passed）。
   * 生产环境无真实安全适配器时 scan 抛错，被捕获为失败关闭；
   * 非生产环境（createArtifactVerification 注入接受桩）scan 恒返回 clean。 */
  async scanStoredAsset(input: { assetKey: string }): Promise<{
    scanStatus: "passed" | "failed";
    sha256: string;
    reason?: string;
  }> {
    try {
      const content = await this.storage.get(input.assetKey);
      if (content === null) {
        return {
          scanStatus: "failed",
          sha256: "",
          reason: "ARTIFACT_NOT_FOUND",
        };
      }
      const sha256 = createHash("sha256").update(content).digest("hex");
      if ((await this.security.scan(content)) === "infected") {
        return { scanStatus: "failed", sha256, reason: "MALWARE_DETECTED" };
      }
      return { scanStatus: "passed", sha256 };
    } catch {
      return {
        scanStatus: "failed",
        sha256: "",
        reason: "ARTIFACT_SECURITY_UNAVAILABLE",
      };
    }
  }

  async verifyStoredArtifact(input: {
    artifactKey: string;
    expectedSha256: string;
    signature: string;
  }): Promise<ArtifactVerificationResult> {
    try {
      const content = await this.storage.get(input.artifactKey);
      if (content === null) {
        return {
          accepted: false,
          scanStatus: "failed",
          sha256: "",
          reason: "ARTIFACT_NOT_FOUND",
        };
      }
      const sha256 = createHash("sha256").update(content).digest("hex");
      if (sha256 !== input.expectedSha256) {
        return {
          accepted: false,
          scanStatus: "failed",
          sha256,
          reason: "DIGEST_MISMATCH",
        };
      }
      if ((await this.security.scan(content)) === "infected") {
        return {
          accepted: false,
          scanStatus: "failed",
          sha256,
          reason: "MALWARE_DETECTED",
        };
      }
      if (!(await this.security.verify(content, input.signature))) {
        return {
          accepted: false,
          scanStatus: "failed",
          sha256,
          reason: "INVALID_SIGNATURE",
        };
      }
      return { accepted: true, scanStatus: "passed", sha256 };
    } catch {
      return {
        accepted: false,
        scanStatus: "failed",
        sha256: "",
        reason: "ARTIFACT_SECURITY_UNAVAILABLE",
      };
    }
  }
}
