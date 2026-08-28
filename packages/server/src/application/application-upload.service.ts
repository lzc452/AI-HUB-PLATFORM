import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { ActorContext, UploadKind } from "@ai-hub/contracts";
import type {
  ApplicationRepository,
  ArtifactUploadRecord,
  AssetRecord,
} from "./application.types.js";
import type {
  CompleteUnifiedUploadBodyDto,
  UnifiedUploadInitRequestDto,
} from "./application.dto.js";
import {
  UPLOAD_KIND_POLICIES,
  assertMagicMatches,
  assertUploadAllowed,
  fileExtension,
} from "./upload-policy.js";
import { assertSafeSvg } from "./content-security.js";
import type { ArtifactPipeline } from "./storage.pipeline.js";
import type { ReadableObjectStoragePort } from "./storage.port.js";

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export interface ApplicationAssetContent {
  stream: NodeJS.ReadableStream;
  mimeType: string;
  assetType: AssetRecord["assetType"];
  fileName: string;
}

/**
 * 应用资产与制品上传的共享业务边界。
 *
 * ApplicationController 与 PortalApplicationUploadController 只负责路由和
 * 响应映射，所有 owner、上传会话、魔数、扫描和资产落库不变量都在此处复用。
 */
export class ApplicationUploadService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly storage: ReadableObjectStoragePort,
    private readonly pipeline: ArtifactPipeline,
  ) {}

  async createUpload(
    actor: ActorContext,
    applicationId: string,
    body: UnifiedUploadInitRequestDto,
  ): Promise<ArtifactUploadRecord> {
    const kind = body.kind as UploadKind;
    try {
      assertUploadAllowed({
        kind,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "UPLOAD_VALIDATION_FAILED",
      );
    }
    await this.requireApplicationOwner(applicationId, actor);

    const uploadId = randomUUID();
    const objectKey = `applications/${applicationId}/uploads/${uploadId}/content`;
    return this.repository.createArtifactUpload({
      applicationId,
      uploadedByEmployeeId: actor.employeeId,
      objectKey,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      kind,
      sha256: null,
      signature: null,
      partCount: 1,
      uploadStatus: "uploading",
      scanStatus: "pending",
      errorCode: null,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
    });
  }

  async uploadContent(
    actor: ActorContext,
    applicationId: string,
    uploadId: string,
    rawBody: Buffer,
  ): Promise<ArtifactUploadRecord> {
    await this.requireApplicationOwner(applicationId, actor);
    const upload = await this.requireUpload(applicationId, uploadId);
    this.assertUploader(upload, actor);
    if (upload.uploadStatus !== "uploading") {
      throw new BadRequestException("UPLOAD_ALREADY_COMPLETED");
    }
    if (!Buffer.isBuffer(rawBody) || rawBody.byteLength === 0) {
      throw new BadRequestException("UPLOAD_BODY_EMPTY");
    }
    if (rawBody.byteLength !== upload.sizeBytes) {
      throw new BadRequestException("UPLOAD_SIZE_MISMATCH");
    }

    const sha256 = createHash("sha256").update(rawBody).digest("hex");
    await this.storage.putStream(upload.objectKey, Readable.from(rawBody));
    const updated = await this.repository.updateArtifactUpload(uploadId, {
      sha256,
    });
    if (updated === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
    return updated;
  }

  async completeUpload(
    actor: ActorContext,
    applicationId: string,
    uploadId: string,
    body: CompleteUnifiedUploadBodyDto,
  ): Promise<{ record: ArtifactUploadRecord; assetId: string | null }> {
    await this.requireApplicationOwner(applicationId, actor);
    const upload = await this.requireUpload(applicationId, uploadId);
    this.assertUploader(upload, actor);
    if (upload.uploadStatus !== "uploading") {
      throw new BadRequestException("UPLOAD_ALREADY_COMPLETED");
    }
    if (upload.sha256 === null) {
      throw new BadRequestException("UPLOAD_CONTENT_MISSING");
    }
    const policy = UPLOAD_KIND_POLICIES[upload.kind];
    const content = await this.storage.get(upload.objectKey);
    if (content === null) {
      throw new BadRequestException("UPLOAD_CONTENT_MISSING");
    }

    const ext = fileExtension(upload.fileName);
    try {
      assertMagicMatches(content, ext);
      if (policy.svgAllowed && ext === "svg") {
        assertSafeSvg(Buffer.from(content).toString("utf8"));
      }
    } catch (error) {
      throw new BadRequestException({
        message: "UPLOAD_VALIDATION_FAILED",
        detail:
          error instanceof Error ? error.message : "UPLOAD_VALIDATION_FAILED",
      });
    }

    const finalKey = `applications/${applicationId}/assets/${uploadId}`;
    if (policy.createsAsset && policy.assetType !== undefined) {
      try {
        const scan = await this.pipeline.scanStoredAsset({
          assetKey: upload.objectKey,
        });
        if (scan.scanStatus !== "passed") {
          const failed = await this.repository.updateArtifactUpload(uploadId, {
            uploadStatus: "failed",
            scanStatus: "failed",
            errorCode: scan.reason ?? "ASSET_SCAN_FAILED",
          });
          if (failed === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
          return { record: failed, assetId: null };
        }
        await this.storage.copy(upload.objectKey, finalKey);
        const updated = await this.repository.updateArtifactUpload(uploadId, {
          uploadStatus: "completed",
          scanStatus: "passed",
          completedAt: new Date(),
          objectKey: finalKey,
          signature: "",
        });
        if (updated === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
        const asset = await this.repository.createAsset({
          applicationId,
          applicationVersionId: null,
          assetType: policy.assetType,
          name: upload.fileName,
          storageKey: finalKey,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          sortOrder: 0,
          sha256: upload.sha256,
          scanStatus: "passed",
          uploadedByEmployeeId: actor.employeeId,
        });
        await this.storage.delete(upload.objectKey).catch(() => undefined);
        return { record: updated, assetId: asset.assetId };
      } catch (error) {
        if (error instanceof NotFoundException) throw error;
        throw new BadRequestException({
          message: "UPLOAD_COMPLETE_FAILED",
          detail:
            error instanceof Error ? error.message : "UPLOAD_COMPLETE_FAILED",
        });
      }
    }

    const signature = body.signature ?? "";
    const result = await this.pipeline.verifyStoredArtifact({
      artifactKey: upload.objectKey,
      expectedSha256: upload.sha256,
      signature,
    });
    if (!result.accepted) {
      const failed = await this.repository.updateArtifactUpload(uploadId, {
        uploadStatus: "failed",
        scanStatus: "failed",
        errorCode: result.reason ?? "UPLOAD_FAILED",
      });
      if (failed === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
      return { record: failed, assetId: null };
    }
    await this.storage.copy(upload.objectKey, finalKey);
    const updated = await this.repository.updateArtifactUpload(uploadId, {
      uploadStatus: "completed",
      scanStatus: "passed",
      signature: signature === "" ? null : signature,
      signed: signature.length > 0,
      completedAt: new Date(),
      objectKey: finalKey,
    });
    if (updated === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
    await this.storage.delete(upload.objectKey).catch(() => undefined);
    return { record: updated, assetId: null };
  }

  async getUpload(
    actor: ActorContext,
    applicationId: string,
    uploadId: string,
  ): Promise<ArtifactUploadRecord> {
    await this.requireApplicationOwner(applicationId, actor);
    const upload = await this.requireUpload(applicationId, uploadId);
    this.assertUploader(upload, actor);
    return upload;
  }

  async getUploadState(
    actor: ActorContext,
    applicationId: string,
    uploadId: string,
  ): Promise<{ record: ArtifactUploadRecord; assetId: string | null }> {
    const record = await this.getUpload(actor, applicationId, uploadId);
    const assets = await this.repository.listAssets(applicationId);
    const asset = assets.find(
      (candidate) =>
        candidate.storageKey ===
        `applications/${applicationId}/assets/${uploadId}`,
    );
    return { record, assetId: asset?.assetId ?? null };
  }

  async getAssetContent(
    actor: ActorContext,
    applicationId: string,
    assetId: string,
  ): Promise<ApplicationAssetContent> {
    const application = await this.repository.findApplication(applicationId);
    if (application === null)
      throw new NotFoundException("APPLICATION_NOT_FOUND");
    const asset = await this.repository.findAsset(assetId);
    if (
      asset === null ||
      asset.applicationId !== applicationId ||
      asset.scanStatus !== "passed"
    ) {
      throw new NotFoundException("APPLICATION_ASSET_NOT_FOUND");
    }

    if (application.status !== "published") {
      if (application.ownerEmployeeId !== actor.employeeId) {
        throw new NotFoundException("APPLICATION_ASSET_NOT_FOUND");
      }
    } else {
      const versionId = application.currentVersionId;
      if (versionId === null) {
        throw new NotFoundException("APPLICATION_ASSET_NOT_FOUND");
      }
      const snapshot = await this.repository.findVersionSnapshot(versionId);
      if (
        snapshot === null ||
        !snapshotReferencesAsset(snapshot.payload, assetId, asset.assetType)
      ) {
        throw new NotFoundException("APPLICATION_ASSET_NOT_FOUND");
      }
    }

    const stream = await this.storage.openReadStream(asset.storageKey);
    if (stream === null)
      throw new NotFoundException("APPLICATION_ASSET_NOT_FOUND");
    return {
      stream,
      mimeType: asset.mimeType,
      assetType: asset.assetType,
      fileName: asset.name,
    };
  }

  private async requireApplicationOwner(
    applicationId: string,
    actor: ActorContext,
  ): Promise<void> {
    const application = await this.repository.findApplication(applicationId);
    if (application === null)
      throw new NotFoundException("APPLICATION_NOT_FOUND");
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new ForbiddenException("APPLICATION_OWNER_REQUIRED");
    }
  }

  private async requireUpload(
    applicationId: string,
    uploadId: string,
  ): Promise<ArtifactUploadRecord> {
    const upload = await this.repository.findArtifactUpload(uploadId);
    if (upload === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
    if (upload.applicationId !== applicationId) {
      throw new BadRequestException("UPLOAD_APPLICATION_MISMATCH");
    }
    if (upload.expiresAt < new Date()) {
      throw new BadRequestException("UPLOAD_EXPIRED");
    }
    return upload;
  }

  private assertUploader(
    upload: ArtifactUploadRecord,
    actor: ActorContext,
  ): void {
    if (upload.uploadedByEmployeeId !== actor.employeeId) {
      throw new ForbiddenException("ARTIFACT_UPLOADER_REQUIRED");
    }
  }
}

function snapshotReferencesAsset(
  payload: unknown,
  assetId: string,
  assetType: AssetRecord["assetType"],
): boolean {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }
  const draft = payload as Record<string, unknown>;
  if (assetType === "icon") {
    const icon = draft.icon;
    return (
      icon !== null &&
      typeof icon === "object" &&
      !Array.isArray(icon) &&
      (icon as Record<string, unknown>).assetId === assetId
    );
  }
  if (assetType === "screenshot") {
    return (
      Array.isArray(draft.screenshotAssetIds) &&
      draft.screenshotAssetIds.some((value) => value === assetId)
    );
  }
  if (assetType === "attachment") {
    const attachmentIds = Array.isArray(draft.attachmentAssetIds)
      ? draft.attachmentAssetIds
      : [];
    return (
      attachmentIds.some((value) => value === assetId) ||
      draft.manualAssetId === assetId ||
      draft.examplesAssetId === assetId
    );
  }
  return false;
}
