import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { IdentityService } from "../identity/identity.service.js";
import { CREATOR_SERVICE } from "./creator.tokens.js";
import { CreatorService } from "./creator.service.js";
import { CreatorSummaryDto } from "./creator.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("创作者")
@Controller("/internal/creator/applications")
export class CreatorController {
  constructor(
    @Inject(CREATOR_SERVICE) private readonly creator: CreatorService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get(":applicationId/summary")
  @ApiOperation({
    summary: "创作者应用摘要",
    description: "返回创作者视角的应用版本差异、校验报告与聚合指标。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "应用摘要", type: CreatorSummaryDto })
  @ApiProblemResponses([400, 401, 403])
  async summary(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    try {
      return await this.creator.getApplicationSummary(
        await this.identity.getActorContext(employeeId, sessionId),
        applicationId,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "CREATOR_REQUEST_FAILED",
      );
    }
  }
}
