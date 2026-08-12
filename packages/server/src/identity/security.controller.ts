import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
} from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
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

@Controller("/internal/security")
@Authenticated()
export class SecurityController {
  constructor(private readonly identity: IdentityService) {}

  @Get("/audit-logs")
  @RequiresPermissions(PERMISSIONS.SECURITY_READ)
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "审计日志记录" })
  @ApiProblemResponses([400, 401, 403])
  async listAuditLogs(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query("eventType") eventType?: string,
    @Query("limit") limit?: string,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    await this.identity.getActorContext(employeeId, sessionId);
    return this.identity.listAuditEvents({
      ...(eventType === undefined ? {} : { eventType }),
      limit: Math.min(
        500,
        Math.max(1, Number.parseInt(limit ?? "100", 10) || 100),
      ),
    });
  }
}
