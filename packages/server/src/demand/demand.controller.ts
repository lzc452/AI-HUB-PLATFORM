import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import type { ActorContext } from "@ai-hub/contracts";
import { IdentityService } from "../identity/identity.service.js";
import { DEMAND_SERVICE } from "./demand.tokens.js";
import { DemandService } from "./demand.service.js";
import type { DemandDraftInput } from "./demand.types.js";

@Controller("/internal/demands")
export class DemandController {
  constructor(
    @Inject(DEMAND_SERVICE) private readonly demands: DemandService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Post()
  create(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandDraftInput,
  ) {
    return this.call(async () =>
      this.demands.createDraft(await this.actor(employeeId, sessionId), body),
    );
  }

  @Patch(":demandId")
  saveDraft(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandDraftInput & { expectedVersion: number },
  ) {
    return this.call(async () => {
      const { expectedVersion, ...input } = body;
      return this.demands.saveDraft(
        await this.actor(employeeId, sessionId),
        demandId,
        expectedVersion,
        input,
      );
    });
  }

  @Post(":demandId/submit-review")
  submitForReview(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.submitForReview(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Post(":demandId/review")
  review(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { decision: "publish" | "reject"; reason?: string },
  ) {
    return this.call(async () =>
      this.demands.review(
        await this.actor(employeeId, sessionId),
        demandId,
        body.decision,
        body.reason,
      ),
    );
  }

  private async actor(
    employeeId: string | undefined,
    sessionId: string | undefined,
  ): Promise<ActorContext> {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    return this.identity.getActorContext(employeeId, sessionId);
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "DEMAND_REQUEST_FAILED";
      if (code === "DEMAND_NOT_FOUND") throw new NotFoundException(code);
      if (
        code === "DEMAND_REVIEW_FORBIDDEN" ||
        code === "DEMAND_NOT_AUTHORIZED"
      ) {
        throw new ForbiddenException(code);
      }
      throw new BadRequestException(code);
    }
  }
}
