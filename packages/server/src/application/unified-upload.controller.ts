import {
  Body,
  Controller,
  Get,
  Headers,
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
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  CurrentActor,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { APPLICATION_UPLOAD_SERVICE } from "./application.tokens.js";
import { ApplicationUploadService } from "./application-upload.service.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";
import {
  UnifiedUploadDto,
  UnifiedUploadInitRequestDto,
  CompleteUnifiedUploadBodyDto,
} from "./application.dto.js";

@ApiTags("应用")
@Controller("/internal/applications")
@Authenticated()
export class UnifiedUploadController {
  constructor(
    @Inject(APPLICATION_UPLOAD_SERVICE)
    private readonly uploads: ApplicationUploadService,
  ) {}

  @Post(":applicationId/uploads")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({
    summary: "创建统一上传会话",
    description: "按 kind 区分大小/扩展名/MIME 校验。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: UnifiedUploadInitRequestDto })
  @ApiCreatedResponse({ description: "上传会话", type: UnifiedUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async createUpload(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") _employeeId: string | undefined,
    @Headers("x-session-id") _sessionId: string | undefined,
    @CurrentActor() actor: ActorContext,
    @Body() body: UnifiedUploadInitRequestDto,
  ): Promise<UnifiedUploadDto> {
    return this.toDto(
      await this.uploads.createUpload(actor, applicationId, body),
    );
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
    @Headers("x-employee-id") _employeeId: string | undefined,
    @Headers("x-session-id") _sessionId: string | undefined,
    @CurrentActor() actor: ActorContext,
    @Body() rawBody: Buffer,
  ): Promise<UnifiedUploadDto> {
    return this.toDto(
      await this.uploads.uploadContent(actor, applicationId, uploadId, rawBody),
    );
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
  @ApiBody({
    schema: { type: "object", properties: { signature: { type: "string" } } },
  })
  @ApiOkResponse({ description: "完成的会话状态", type: UnifiedUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async completeUpload(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") _employeeId: string | undefined,
    @Headers("x-session-id") _sessionId: string | undefined,
    @CurrentActor() actor: ActorContext,
    @Body() body: CompleteUnifiedUploadBodyDto,
  ): Promise<UnifiedUploadDto> {
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
  @ApiOperation({ summary: "查询上传/扫描状态" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "uploadId", description: "上传会话 ID" })
  @ApiOkResponse({ description: "上传会话状态", type: UnifiedUploadDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getUpload(
    @Param("applicationId") applicationId: string,
    @Param("uploadId") uploadId: string,
    @Headers("x-employee-id") _employeeId: string | undefined,
    @Headers("x-session-id") _sessionId: string | undefined,
    @CurrentActor() actor: ActorContext,
  ): Promise<UnifiedUploadDto> {
    return this.toDto(
      await this.uploads.getUpload(actor, applicationId, uploadId),
    );
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
