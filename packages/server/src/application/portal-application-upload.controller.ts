import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import type { ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  CurrentActor,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  ApiProblemResponses,
  ApiIdentityHeaders,
} from "../system/http/api-docs.decorator.js";
import {
  CompleteUnifiedUploadBodyDto,
  UnifiedUploadInitRequestDto,
} from "./application.dto.js";
import { APPLICATION_UPLOAD_SERVICE } from "./application.tokens.js";
import { ApplicationUploadService } from "./application-upload.service.js";
import type { ArtifactUploadRecord } from "./application.types.js";

export class PortalApplicationUploadDto {
  @ApiProperty()
  uploadId!: string;
  @ApiProperty()
  kind!: string;
  @ApiProperty()
  fileName!: string;
  @ApiProperty()
  mimeType!: string;
  @ApiProperty()
  sizeBytes!: number;
  @ApiProperty()
  uploadStatus!: string;
  @ApiProperty()
  scanStatus!: string;
  @ApiProperty({ nullable: true })
  sha256!: string | null;
  @ApiProperty({ nullable: true })
  errorCode!: string | null;
  @ApiProperty({ nullable: true })
  assetId!: string | null;
}

@ApiTags("AI Hub Portal")
@Controller("/internal/portal/dashboard/publish/app")
@Authenticated()
export class PortalApplicationUploadController {
  constructor(
    @Inject(APPLICATION_UPLOAD_SERVICE)
    private readonly uploads: ApplicationUploadService,
  ) {}

  @Post(":applicationId/uploads")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "Portal 应用资产上传会话" })
  @ApiIdentityHeaders()
  @ApiBody({ type: UnifiedUploadInitRequestDto })
  @ApiCreatedResponse({ type: PortalApplicationUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  createUpload(
    @CurrentActor() actor: ActorContext,
    @Param("applicationId") applicationId: string,
    @Body() body: UnifiedUploadInitRequestDto,
  ) {
    return this.uploads
      .createUpload(actor, applicationId, body)
      .then((record) => this.toDto(record));
  }

  @Put(":applicationId/uploads/:uploadId/content")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({ summary: "Portal 应用资产上传内容" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: PortalApplicationUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  uploadContent(
    @CurrentActor() actor: ActorContext,
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Body() rawBody: Buffer,
  ) {
    return this.uploads
      .uploadContent(actor, applicationId, uploadId, rawBody)
      .then((record) => this.toDto(record));
  }

  @Post(":applicationId/uploads/:uploadId/complete")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({ summary: "Portal 应用资产完成上传" })
  @ApiIdentityHeaders()
  @ApiBody({ type: CompleteUnifiedUploadBodyDto })
  @ApiOkResponse({ type: PortalApplicationUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async completeUpload(
    @CurrentActor() actor: ActorContext,
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Body() body: CompleteUnifiedUploadBodyDto,
  ) {
    const result = await this.uploads.completeUpload(
      actor,
      applicationId,
      uploadId,
      body,
    );
    return this.toDto(result.record, result.assetId);
  }

  @Get(":applicationId/uploads/:uploadId")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "Portal 应用资产上传状态" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: PortalApplicationUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getUpload(
    @CurrentActor() actor: ActorContext,
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
  ) {
    const state = await this.uploads.getUploadState(
      actor,
      applicationId,
      uploadId,
    );
    return this.toDto(state.record, state.assetId);
  }

  private toDto(
    record: ArtifactUploadRecord,
    assetId: string | null = null,
  ): PortalApplicationUploadDto {
    return {
      uploadId: record.uploadId,
      kind: record.kind,
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
