import { createHash } from "node:crypto";
import type { ClaimedOutboxEvent } from "@ai-hub/contracts";
import type { KyselyApplicationRepository } from "./application.repository.js";
import type { ArtifactUploadRecord } from "./application.types.js";
import type {
  MalwareScannerPort,
  ObjectStoragePort,
  SignatureSignerPort,
  SignatureVerifierPort,
} from "./storage.port.js";

export interface ArtifactVerificationWorkerOptions {
  repository: KyselyApplicationRepository;
  storage: ObjectStoragePort;
  scanner: MalwareScannerPort;
  verifier: SignatureVerifierPort;
  signer?: SignatureSignerPort;
  finalObjectKey?: (upload: ArtifactUploadRecord) => string;
}

/**
 * 负责把 staging object 转换为可交付 object。所有状态落库都通过 CAS，
 * 因此 Outbox 重试或 worker 并发不会重复完成同一上传会话。
 */
export class ArtifactVerificationWorker {
  private readonly finalObjectKey: (upload: ArtifactUploadRecord) => string;

  public constructor(
    private readonly options: ArtifactVerificationWorkerOptions,
  ) {
    this.finalObjectKey =
      options.finalObjectKey ??
      ((upload) =>
        `applications/${upload.applicationId}/artifacts/${upload.uploadId}/content`);
  }

  public handler = async (event: ClaimedOutboxEvent): Promise<void> => {
    const uploadId = readUploadId(event.payload);
    if (uploadId === null) throw new Error("ARTIFACT_UPLOAD_ID_MISSING");
    await this.verify(uploadId);
  };

  public async verify(uploadId: string): Promise<ArtifactUploadRecord | null> {
    const upload = await this.options.repository.findArtifactUpload(uploadId);
    if (upload === null || upload.uploadStatus === "completed") return upload;
    if (upload.uploadStatus !== "verifying") return upload;

    const stagingKey = upload.stagingObjectKey ?? upload.objectKey;
    const content = await this.options.storage.get(stagingKey);
    if (content === null) {
      await this.fail(upload, "ARTIFACT_NOT_FOUND");
      return null;
    }

    const actualSha256 = createHash("sha256").update(content).digest("hex");
    if (upload.sha256 === null || actualSha256 !== upload.sha256) {
      await this.fail(upload, "DIGEST_MISMATCH");
      return null;
    }

    let scan: "clean" | "infected";
    try {
      scan = await this.options.scanner.scan(content);
    } catch {
      await this.fail(upload, "ARTIFACT_SECURITY_UNAVAILABLE");
      return null;
    }
    if (scan === "infected") {
      await this.fail(upload, "MALWARE_DETECTED");
      return null;
    }

    // 规格 §5.5：未签名制品不得自动签名。无签名（或空签名）的制品在通过
    // 摘要与恶意软件校验后以 signed=false 完成，显著标记并进入人工确认；
    // 已签名制品仍须通过签名校验（fail-closed）。
    const signature = upload.signature ?? "";
    const signed = signature.length > 0;
    if (signed && !(await this.options.verifier.verify(content, signature))) {
      await this.fail(upload, "INVALID_SIGNATURE");
      return null;
    }

    const finalKey = this.finalObjectKey(upload);
    if (stagingKey !== finalKey) {
      try {
        await this.options.storage.copy(stagingKey, finalKey);
      } catch {
        await this.fail(upload, "STORAGE_FINALIZE_FAILED");
        return null;
      }
    }

    const finalized = await this.options.repository.withTransaction(
      async (repository) => {
        const finalize = repository.finalizeArtifactVerification;
        if (finalize === undefined)
          throw new Error("ARTIFACT_INTAKE_UNAVAILABLE");
        const result = await finalize.call(repository, {
          uploadId,
          objectKey: finalKey,
          signature: signed ? signature : null,
          signed,
        });
        if (result === null) return null;
        await repository.recordAudit({
          applicationId: result.applicationId,
          actorEmployeeId: result.uploadedByEmployeeId,
          eventType: "application.artifact.verification.completed",
          details: { uploadId, objectKey: finalKey, sha256: result.sha256 },
        });
        await repository.emitOutbox({
          applicationId: result.applicationId,
          eventType: "artifact.verification.completed",
          details: { uploadId, objectKey: finalKey },
        });
        return result;
      },
    );

    if (finalized !== null && stagingKey !== finalKey) {
      await this.options.storage.delete(stagingKey).catch(() => undefined);
    }
    return finalized;
  }

  public async reconcileStale(olderThan: Date, limit = 25): Promise<number> {
    const list = this.options.repository.listStaleArtifactVerifications;
    const reset = this.options.repository.resetStaleArtifactVerification;
    if (list === undefined || reset === undefined) return 0;
    const stale = await list.call(this.options.repository, {
      olderThan,
      limit,
    });
    let resetCount = 0;
    for (const upload of stale) {
      const resetInTransaction = await this.options.repository.withTransaction(
        async (repository) => {
          const resetInTransaction = repository.resetStaleArtifactVerification;
          if (resetInTransaction === undefined) return false;
          const resetResult = await resetInTransaction.call(
            repository,
            upload.uploadId,
          );
          if (!resetResult) return false;
          await repository.recordAudit({
            applicationId: upload.applicationId,
            actorEmployeeId: null,
            eventType: "application.artifact.verification.recovered",
            details: { uploadId: upload.uploadId },
          });
          await repository.emitOutbox({
            applicationId: upload.applicationId,
            eventType: "artifact.verification.requested",
            details: { uploadId: upload.uploadId },
          });
          return true;
        },
      );
      if (resetInTransaction) resetCount += 1;
    }
    return resetCount;
  }

  private async fail(
    upload: ArtifactUploadRecord,
    errorCode: string,
  ): Promise<void> {
    await this.options.repository.withTransaction(async (repository) => {
      const fail = repository.failArtifactVerification;
      if (fail === undefined) throw new Error("ARTIFACT_INTAKE_UNAVAILABLE");
      const result = await fail.call(repository, {
        uploadId: upload.uploadId,
        errorCode,
      });
      if (result === null) return;
      await repository.recordAudit({
        applicationId: result.applicationId,
        actorEmployeeId: result.uploadedByEmployeeId,
        eventType: "application.artifact.verification.failed",
        details: { uploadId: result.uploadId, errorCode },
      });
      await repository.emitOutbox({
        applicationId: result.applicationId,
        eventType: "artifact.verification.failed",
        details: { uploadId: result.uploadId, errorCode },
      });
    });
  }
}

function readUploadId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload as { details?: unknown; uploadId?: unknown };
  if (typeof value.uploadId === "string") return value.uploadId;
  if (typeof value.details !== "object" || value.details === null) return null;
  const details = value.details as { uploadId?: unknown };
  return typeof details.uploadId === "string" ? details.uploadId : null;
}
