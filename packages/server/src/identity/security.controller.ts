import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { IsObject, IsOptional } from "class-validator";
import { Readable } from "node:stream";
import { ApiBody, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { ApiPropertyOptional } from "@nestjs/swagger/dist/decorators/api-property.decorator.js";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "./identity.service.js";
import { AuditService } from "../system/security/audit.service.js";
import { SECURITY_AUDIT_STORAGE } from "../system/security/security.tokens.js";
import type { ReadableObjectStoragePort } from "../application/storage.port.js";
import { SecurityAuditQueryDto } from "./identity.dto.js";

/** 审计导出请求。 */
export class AuditExportRequestDto {
  @ApiPropertyOptional({ type: Object, description: "导出过滤条件快照" })
  @IsOptional()
  @IsObject()
  filterSnapshot!: unknown;
}

@Controller("/internal/security")
@Authenticated()
export class SecurityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional()
    @Inject(SECURITY_AUDIT_STORAGE)
    private readonly storage: ReadableObjectStoragePort | undefined,
  ) {}

  @Get("/audit-logs")
  @RequiresPermissions(PERMISSIONS.SECURITY_READ)
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "安全审计事件（分页）" })
  @ApiProblemResponses([400, 401, 403])
  async listAuditLogs(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query() query: SecurityAuditQueryDto,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    await this.identity.getActorContext(employeeId, sessionId);
    const resultValue =
      query.result === "success" ||
      query.result === "failure" ||
      query.result === "denied" ||
      query.result === "error"
        ? query.result
        : undefined;
    return this.audit.listEvents({
      ...(query.keyword === undefined ? {} : { keyword: query.keyword }),
      ...(query.module === undefined ? {} : { module: query.module }),
      ...(query.action === undefined ? {} : { action: query.action }),
      ...(query.actor === undefined
        ? {}
        : { actorEmployeeId: query.actor }),
      ...(resultValue === undefined ? {} : { result: resultValue }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      page: query.page ?? 1,
      pageSize: Math.min(200, query.pageSize ?? 50),
    });
  }

  @Post("/audit-exports")
  @RequiresPermissions(PERMISSIONS.SECURITY_AUDIT_EXPORT)
  @HttpCode(200)
  @ApiOperation({ summary: "创建审计导出任务" })
  @ApiIdentityHeaders()
  @ApiBody({ type: AuditExportRequestDto })
  @ApiOkResponse({ description: "导出任务已排队" })
  @ApiProblemResponses([400, 401, 403])
  async createExport(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: AuditExportRequestDto,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    await this.identity.getActorContext(employeeId, sessionId);
    const job = await this.audit.createExportJob({
      actorEmployeeId: employeeId,
      filterSnapshot: body.filterSnapshot ?? {},
    });
    return { accepted: true, exportJobId: job.exportJobId, status: job.status };
  }

  @Get("/audit-exports/:exportId")
  @RequiresPermissions(PERMISSIONS.SECURITY_AUDIT_EXPORT)
  @ApiIdentityHeaders()
  async getExportStatus(
    @Param("exportId") exportId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requireActor(employeeId, sessionId);
    const job = await this.audit.getExportJob(exportId);
    if (job === null) throw new NotFoundException("AUDIT_EXPORT_NOT_FOUND");
    return {
      exportId: job.exportJobId,
      status: job.status,
      resultStorageKey: job.resultStorageKey,
      failureCode: job.failureCode,
      expiresAt: job.expiresAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }

  @Get("/audit-exports/:exportId/download")
  @RequiresPermissions(PERMISSIONS.SECURITY_AUDIT_EXPORT)
  @ApiIdentityHeaders()
  async downloadExport(
    @Param("exportId") exportId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requireActor(employeeId, sessionId);
    const job = await this.audit.getExportJob(exportId);
    if (
      job === null ||
      job.status !== "completed" ||
      job.resultStorageKey === null
    ) {
      throw new NotFoundException("AUDIT_EXPORT_NOT_READY");
    }
    if (job.expiresAt !== null && job.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException("AUDIT_EXPORT_EXPIRED");
    }
    if (this.storage === undefined) {
      throw new NotFoundException("AUDIT_EXPORT_STORAGE_UNAVAILABLE");
    }
    const stream = await this.storage.openReadStream(job.resultStorageKey);
    if (stream === null)
      throw new NotFoundException("AUDIT_EXPORT_FILE_NOT_FOUND");
    return new StreamableFile(
      stream instanceof Readable
        ? stream
        : Readable.from(stream as AsyncIterable<Uint8Array>),
      {
        type: "application/x-ndjson; charset=utf-8",
        disposition: `attachment; filename="audit-export-${exportId}.jsonl"`,
      },
    );
  }

  private async requireActor(
    employeeId: string | undefined,
    sessionId: string | undefined,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    return this.identity.getActorContext(employeeId, sessionId);
  }
}
