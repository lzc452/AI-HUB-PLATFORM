import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
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

/** 审计导出请求。 */
export class AuditExportRequestDto {
  filterSnapshot!: unknown;
}

@Controller("/internal/security")
@Authenticated()
export class SecurityController {
  constructor(
    private readonly identity: IdentityService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get("/audit-logs")
  @RequiresPermissions(PERMISSIONS.SECURITY_READ)
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "安全审计事件（分页）" })
  @ApiProblemResponses([400, 401, 403])
  async listAuditLogs(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query("keyword") keyword?: string,
    @Query("module") module?: string,
    @Query("action") action?: string,
    @Query("actor") actor?: string,
    @Query("result") result?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    await this.identity.getActorContext(employeeId, sessionId);
    const resultValue =
      result === "success" || result === "failure" || result === "blocked"
        ? result
        : undefined;
    return this.audit.listEvents({
      ...(keyword === undefined ? {} : { keyword }),
      ...(module === undefined ? {} : { module }),
      ...(action === undefined ? {} : { action }),
      ...(actor === undefined ? {} : { actorEmployeeId: actor }),
      ...(resultValue === undefined ? {} : { result: resultValue }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      page: Number.parseInt(page ?? "1", 10) || 1,
      pageSize: Math.min(200, Number.parseInt(pageSize ?? "50", 10) || 50),
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
}
