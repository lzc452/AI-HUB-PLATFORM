import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
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
import type { Request } from "express";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { KyselyApplicationRepository } from "./application.repository.js";
import {
  ARTIFACT_MAX_SIZE_BYTES,
  ARTIFACT_PIPELINE,
  ARTIFACT_STORAGE,
} from "./application.tokens.js";
import { ArtifactPipeline } from "./storage.pipeline.js";
import { DiskObjectStorage } from "./storage.disk.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";
import {
  ArtifactUploadDto,
  ArtifactUploadInitRequestDto,
  AssetDto,
  CompleteArtifactUploadRequestDto,
  CreateAssetRequestDto,
} from "./application.dto.js";

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

@ApiTags("应用")
@Controller("/internal/applications")
@Authenticated()
export class ArtifactUploadController {
  constructor(
    private readonly repository: KyselyApplicationRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ARTIFACT_STORAGE) private readonly storage: DiskObjectStorage,
    @Inject(ARTIFACT_PIPELINE) private readonly pipeline: ArtifactPipeline,
    @Inject(ARTIFACT_MAX_SIZE_BYTES)
    private readonly maxSizeBytes: number,
  ) {}

  @Post(":applicationId/artifact-uploads")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "创建 artifact 上传会话" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: ArtifactUploadInitRequestDto })
  @ApiCreatedResponse({
    description: "上传会话",
    type: ArtifactUploadDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async createUpload(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: ArtifactUploadInitRequestDto,
  ): Promise<ArtifactUploadDto> {
    const actor = await this.requireActor(employeeId, sessionId, "update");
    this.assertSize(body.sizeBytes);
    const application = await this.repository.findApplication(applicationId);
    if (application === null)
      throw new NotFoundException("APPLICATION_NOT_FOUND");

    const uploadId = randomUUID();
    const objectKey = `applications/${applicationId}/uploads/${uploadId}/content`;
    const record = await this.repository.createArtifactUpload({
      applicationId,
      uploadedByEmployeeId: actor.employeeId,
      objectKey,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
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

  @Put(":applicationId/artifact-uploads/:uploadId/content")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({ summary: "上传 artifact 内容（raw body，单请求）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "uploadId", description: "上传会话 ID" })
  @ApiOkResponse({ description: "上传后的会话状态", type: ArtifactUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async uploadContent(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Req() request: Request,
  ): Promise<ArtifactUploadDto> {
    await this.requireActor(employeeId, sessionId, "update");
    const upload = await this.requireUpload(applicationId, uploadId);
    if (upload.uploadStatus !== "uploading") {
      throw new BadRequestException("UPLOAD_ALREADY_COMPLETED");
    }
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (rawBody === undefined || rawBody.byteLength === 0) {
      throw new BadRequestException("UPLOAD_BODY_EMPTY");
    }
    this.assertSize(rawBody.byteLength);

    const sha256 = createHash("sha256").update(rawBody).digest("hex");
    await this.storage.putStream(upload.objectKey, Readable.from(rawBody));
    const updated = await this.repository.updateArtifactUpload(uploadId, {
      sizeBytes: rawBody.byteLength,
      sha256,
    });
    if (updated === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
    return this.toDto(updated);
  }

  @Post(":applicationId/artifact-uploads/:uploadId/complete")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({ summary: "完成 artifact 上传（校验并落 final key）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "uploadId", description: "上传会话 ID" })
  @ApiBody({ type: CompleteArtifactUploadRequestDto })
  @ApiOkResponse({
    description: "完成的会话状态（scan_status=passed 可创建版本）",
    type: ArtifactUploadDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async completeUpload(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: CompleteArtifactUploadRequestDto,
  ): Promise<ArtifactUploadDto> {
    await this.requireActor(employeeId, sessionId, "update");
    const upload = await this.requireUpload(applicationId, uploadId);
    if (upload.uploadStatus !== "uploading") {
      throw new BadRequestException("UPLOAD_ALREADY_COMPLETED");
    }
    if (upload.sha256 === null) {
      throw new BadRequestException("UPLOAD_CONTENT_MISSING");
    }

    const finalKey = `applications/${applicationId}/artifacts/${uploadId}`;
    const signature = body.signature ?? "";
    const result = await this.pipeline.registerVerifiedArtifact({
      artifactKey: finalKey,
      sha256: upload.sha256,
      signature,
    });
    if (!result.accepted) {
      const updated = await this.repository.updateArtifactUpload(uploadId, {
        uploadStatus: "failed",
        scanStatus: "failed",
        errorCode: result.reason ?? "UPLOAD_FAILED",
      });
      return this.toDto(updated ?? upload);
    }

    await this.storage.copy(upload.objectKey, finalKey);
    await this.storage.delete(upload.objectKey);
    const updated = await this.repository.updateArtifactUpload(uploadId, {
      uploadStatus: "completed",
      scanStatus: "passed",
      signature,
      completedAt: new Date(),
      objectKey: finalKey,
    });
    if (updated === null) throw new NotFoundException("UPLOAD_NOT_FOUND");
    return this.toDto(updated);
  }

  @Get(":applicationId/artifact-uploads/:uploadId")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "查询上传/扫描状态" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "uploadId", description: "上传会话 ID" })
  @ApiOkResponse({ description: "上传会话状态", type: ArtifactUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getUploadStatus(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ): Promise<ArtifactUploadDto> {
    await this.requireActor(employeeId, sessionId, "read");
    const upload = await this.requireUpload(applicationId, uploadId);
    return this.toDto(upload);
  }

  @Get(":applicationId/assets")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "资产列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "资产列表", type: AssetDto, isArray: true })
  @ApiProblemResponses([400, 401, 403, 404])
  async listAssets(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ): Promise<AssetDto[]> {
    await this.requireActor(employeeId, sessionId, "read");
    const assets = await this.repository.listAssets(applicationId);
    return assets.map((asset) => this.toAssetDto(asset));
  }

  @Post(":applicationId/assets")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "创建资产记录" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: CreateAssetRequestDto })
  @ApiCreatedResponse({ description: "创建后的资产", type: AssetDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async createAsset(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: CreateAssetRequestDto,
  ): Promise<AssetDto> {
    const actor = await this.requireActor(employeeId, sessionId, "update");
    const asset = await this.repository.createAsset({
      applicationId,
      applicationVersionId: null,
      assetType: body.assetType,
      name: body.name,
      storageKey: body.storageKey,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      sortOrder: body.sortOrder ?? 0,
      sha256: body.sha256 ?? null,
      scanStatus: "pending",
      uploadedByEmployeeId: actor.employeeId,
    });
    return this.toAssetDto(asset);
  }

  @Delete(":applicationId/assets/:assetId")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(204)
  @ApiOperation({ summary: "删除资产" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "assetId", description: "资产 ID" })
  @ApiProblemResponses([400, 401, 403, 404])
  async deleteAsset(
    @Param("applicationId") applicationId: string,
    @Param("assetId") assetId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ): Promise<void> {
    await this.requireActor(employeeId, sessionId, "update");
    const asset = await this.repository.findAsset(assetId);
    if (asset === null) throw new NotFoundException("ASSET_NOT_FOUND");
    if (asset.applicationId !== applicationId) {
      throw new BadRequestException("ASSET_APPLICATION_MISMATCH");
    }
    await this.repository.deleteAsset(assetId);
  }

  private assertSize(sizeBytes: number): void {
    if (sizeBytes > this.maxSizeBytes) {
      throw new BadRequestException("ARTIFACT_TOO_LARGE");
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
    if (employeeId === undefined || sessionId === undefined)
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
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
  ): ArtifactUploadDto {
    return {
      uploadId: record.uploadId,
      objectKey: record.objectKey,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      uploadStatus: record.uploadStatus,
      scanStatus: record.scanStatus,
      sha256: record.sha256,
      errorCode: record.errorCode,
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  private toAssetDto(
    record: import("./application.types.js").AssetRecord,
  ): AssetDto {
    return {
      assetId: record.assetId,
      assetType: record.assetType,
      name: record.name,
      storageKey: record.storageKey,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
      scanStatus: record.scanStatus,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
