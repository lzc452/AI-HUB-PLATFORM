import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Get,
  Body,
} from "@nestjs/common";
import { IdentityService } from "../identity/identity.service.js";
import { INTERACTION_SERVICE } from "./interaction.tokens.js";
import { InteractionService } from "./interaction.service.js";

@Controller("/internal/applications/:applicationId/interactions")
export class InteractionController {
  constructor(
    @Inject(INTERACTION_SERVICE)
    private readonly interactions: InteractionService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Post("like")
  toggleLike(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.interactions.toggleLike(
        await this.actor(employeeId, sessionId),
        applicationId,
      ),
    );
  }

  @Post("rating")
  rate(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: { stars: number; body?: string; displayAnonymously?: boolean },
  ) {
    return this.call(async () =>
      this.interactions.rate(await this.actor(employeeId, sessionId), {
        applicationId,
        ...body,
      }),
    );
  }

  @Post("comments")
  reply(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { parentCommentId: string | null; body: string },
  ) {
    return this.call(async () =>
      this.interactions.reply(await this.actor(employeeId, sessionId), {
        applicationId,
        ...body,
      }),
    );
  }

  @Post("comments/:commentId/reports")
  report(
    @Param("applicationId") applicationId: string,
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { reason: string },
  ) {
    return this.call(async () =>
      this.interactions.report(await this.actor(employeeId, sessionId), {
        applicationId,
        commentId,
        reason: body.reason,
      }),
    );
  }

  @Post("reports/:reportId/resolve")
  resolveReport(
    @Param("applicationId") _applicationId: string,
    @Param("reportId") reportId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { status: "dismissed" | "hidden" | "restored" },
  ) {
    return this.call(async () =>
      this.interactions.resolveReport(
        await this.actor(employeeId, sessionId),
        reportId,
        body.status,
      ),
    );
  }

  @Get("comments/:commentId/anonymous-author")
  anonymousAuthor(
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.interactions.lookupAnonymousAuthor(
        await this.actor(employeeId, sessionId),
        commentId,
      ),
    );
  }

  private async actor(
    employeeId: string | undefined,
    sessionId: string | undefined,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    return this.identity.getActorContext(employeeId, sessionId);
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "INTERACTION_REQUEST_FAILED",
      );
    }
  }
}
