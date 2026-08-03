import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
} from "@nestjs/common";
import { IdentityService } from "../identity/identity.service.js";
import { CREATOR_SERVICE } from "./creator.tokens.js";
import { CreatorService } from "./creator.service.js";

@Controller("/internal/creator/applications")
export class CreatorController {
  constructor(
    @Inject(CREATOR_SERVICE) private readonly creator: CreatorService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get(":applicationId/summary")
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
