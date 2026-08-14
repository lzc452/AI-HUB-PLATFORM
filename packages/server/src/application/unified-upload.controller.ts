import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { PERMISSIONS, type ActorContext, type UploadKind } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { KyselyApplicationRepository } from "./application.repository.js";
import { ARTIFACT_PIPELINE, ARTIFACT_STORAGE } from "./application.tokens.js";
import { ArtifactPipeline } from "./storage.pipeline.js";
import type { ReadableObjectStoragePort } from "./storage.port.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";
import {
  UnifiedUploadDto,
  UnifiedUploadInitRequestDto,
} from "./application.dto.js";
import {
  UPLOAD_KIND_POLICIES,
  assertMagicMatches,
  assertUploadAllowed,
  fileExtension,
} from "./upload-policy.js";
import { assertSafeSvg } from "./content-security.js";

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

@ApiTags("应用")
@Controller("/internal/applications")
@Authenticated()
export class UnifiedUploadController {
  constructor(
    @Inject(KyselyApplicationRepository)
    private readonly repository: KyselyApplicationRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ARTIFACT_STORAGE)
    private readonly storage: ReadableObjectStoragePort,
    @Inject(ARTIFACT_PIPELINE) private readonly pipeline: ArtifactPipeline,
  ) {}

  @Post(":applicationId/uploads")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "创建统一上传会话", description: "按 kind 区分大小/扩展名/MIME 校验。" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: UnifiedUploadInitRequestDto })
  @ApiCreatedResponse({ description: "上传会话", type: UnifiedUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async createUpload(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: UnifiedUploadInitRequestDto,
  ): Promise<UnifiedUploadDto> {
    const actor = await this.requireActor(employeeId, sessionId, "update");
    const kind = body.kind as UploadKind;
    assertUploadAllowed({
      kind,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    await this.requireApplicationOwner(applicationId, actor);

    const uploadId = randomUUID();
    const objectKey = `applications/${applicationId}/uploads/${uploadId}/content`;
    const record = await this.repository.createArtifactUpload({
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
    return this.toDto(record);
  }

  @Put(":applicationId/uploads/:uploadId/content")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({ summary: "上传内容（raw body，单请求）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "uploadId", description: "上传会话 ID" })
  @ApiOkResponse({ description: "上传后的会话状态", type: UnifiedUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async uploadContent(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() rawBody: Buffer,
  ): Promise<UnifiedUploadDto> {
    const actor = await this.requireActor(employeeId, sessionId, "update");
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
    return this.toDto(updated);
  }

  @Post(":applicationId/uploads/:uploadId/complete")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({
    summary: "完成上传（校验并落 final key）",
    description: "资产类 kind 完成后自动创建 asset 记录；artifact 走签名校验。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "uploadId", description: "上传会话 ID" })
  @ApiBody({ schema: { type: "object", properties: { signature: { type: "string" } } } })
  @ApiOkResponse({ description: "完成的会话状态", type: UnifiedUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async completeUpload(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { signature?: string },
  ): Promise<UnifiedUploadDto> {
    const actor = await this.requireActor(employeeId, sessionId, "update");
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
    if (content === null) throw new BadRequestException("UPLOAD_CONTENT_MISSING");
    const ext = fileExtension(upload.fileName);
    assertMagicMatches(content, ext);
    if (policy.svgAllowed && ext === "svg") {
      assertSafeSvg(Buffer.from(content).toString("utf8"));
    }

    const finalKey = `applications/${applicationId}/assets/${uploadId}`;
    if (policy.createsAsset && policy.assetType !== undefined) {
      const scan = await this.pipeline.scanStoredAsset({ assetKey: upload.objectKey });
      if (scan.scanStatus !== "passed") {
        const failed = await this.repository.updateArtifactUpload(uploadId, {
          uploadStatus: "failed",
          scanStatus: "failed",
          errorCode: scan.reason ?? "ASSET_SCAN_FAILED",
        });
        return this.toDto(failed ?? upload);
      }
      await this.storage.copy(upload.objectKey, finalKey);
      const updated = await this.repository.updateArtifactUpload(uploadId, {
        uploadStatus: "completed",
        scanStatus: "passed",
        completedAt: new Date(),
        objectKey: finalKey,
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
      return this.toDto(updated, asset.assetId);
    }

    // artifact kind：复用签名校验管线。
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
      return this.toDto(failed ?? upload);
    }
    await this.storage.copy(upload.objectKey, finalKey);
    const updated = await this.repository.updateArtifactUpload(uploadId, {
      uploadStatus: "completed",
      scanStatus: "passed",
      signature,
      completedAt: new Date(),
      objectKey: finalKey,
    });
    if (updated === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
    await this.storage.delete(upload.objectKey).catch(() => undefined);
    return this.toDto(updated);
  }

  @Get(":applicationId/uploads/:uploadId")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "查询上传/扫描状态" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "uploadId", description: "上传会话 ID" })
  @ApiOkResponse({ description: "上传会话状态", type: UnifiedUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getUpload(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ): Promise<UnifiedUploadDto> {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    await this.requireApplicationOwner(applicationId, actor);
    const upload = await this.requireUpload(applicationId, uploadId);
    this.assertUploader(upload, actor);
    return this.toDto(upload);
  }

  private assertUploader(
    upload: import("./application.types.js").ArtifactUploadRecord,
    actor: ActorContext,
  ): void {
    if (upload.uploadedByEmployeeId !== actor.employeeId) {
      throw new ForbiddenException("ARTIFACT_UPLOADER_REQUIRED");
    }
  }

  private async requireApplicationOwner(
    applicationId: string,
    actor: ActorContext,
  ): Promise<void> {
    const application = await this.repository.findApplication(applicationId);
    if (application === null) throw new NotFoundException("APPLICATION_NOT_FOUND");
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new ForbiddenException("APPLICATION_OWNER_REQUIRED");
    }
  }

  private async requireUpload(applicationId: string, uploadId: string) {
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

  private async requireActor(
    employeeId: string | undefined,
    sessionId: string | undefined,
    action: string,
  ): Promise<ActorContext> {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    const actor = await this.identity.getActorContext(employeeId, sessionId);
    const decision = await this.identity.authorize({
      actor,
      action,
      resourceType: "application",
    });
    if (!decision.allowed) throw new ForbiddenException("NOT_AUTHORIZED");
    return actor;
  }

  private toDto(
    record: import("./application.types.js").ArtifactUploadRecord,
    assetId: string | null = null,
  ): UnifiedUploadDto {
    return {
      uploadId: record.uploadId,
      kind: record.kind,
      objectKey: record.objectKey,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      uploadStatus: record.uploadStatus,
      scanStatus: record.scanStatus,
      sha256: record.sha256,
      errorCode: record.errorCode,
      assetId,
    };
  }
}
