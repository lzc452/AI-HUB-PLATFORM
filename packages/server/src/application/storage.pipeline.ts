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

  /**
   * 注册一个已通过校验的 artifact（大文件单请求上传路径使用）。
   * 上传完成时由外部完成 digest/scan/verify 校验后调用，使后续 createVersion 的
   * verifyArtifact 可以命中，避免大文件经内存 chunk Map 承载。
   */
  async registerVerifiedArtifact(input: {
    artifactKey: string;
    sha256: string;
    signature: string;
  }): Promise<ArtifactVerificationResult> {
    const result = {
      accepted: true,
      scanStatus: "passed",
      sha256: input.sha256,
    } as const;
    this.verifications.set(input.artifactKey, result);
    this.verifiedSignatures.set(input.artifactKey, input.signature);
    return result;
  }
}
