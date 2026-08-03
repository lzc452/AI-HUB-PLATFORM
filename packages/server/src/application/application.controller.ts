import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import type { ActorContext } from "@ai-hub/contracts";
import { IdentityService } from "../identity/identity.service.js";
import { APPLICATION_SERVICE } from "./application.tokens.js";
import { ApplicationService } from "./application.service.js";

@Controller("/internal/applications")
export class ApplicationController {
  constructor(
    @Inject(APPLICATION_SERVICE)
    private readonly applications: ApplicationService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Post()
  async create(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      name: string;
      summary: string;
      maintainerEmployeeId?: string;
      departmentId?: string;
    },
  ) {
    return this.call(async () =>
      this.applications.createApplication(
        await this.requireActor(employeeId, sessionId, "create"),
        body,
      ),
    );
  }

  @Post(":applicationId/versions")
  async createVersion(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      version: string;
      changelog: string;
      artifactKey: string;
      artifactSha256: string;
      artifactSignature: string;
      scanStatus: "passed";
    },
  ) {
    return this.call(async () =>
      this.applications.createVersion(
        await this.requireActor(employeeId, sessionId, "update"),
        applicationId,
        body,
      ),
    );
  }

  @Put(":applicationId/deliveries/:channel")
  @HttpCode(200)
  async configureDelivery(
    @Param("applicationId") applicationId: string,
    @Param("channel") channel: "web" | "desktop" | "mobile" | "mini_program",
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: { entryUrl: string; minClientVersion?: string; enabled: boolean },
  ) {
    return this.call(async () =>
      this.applications.configureDelivery(
        await this.requireActor(employeeId, sessionId, "update"),
        applicationId,
        { ...body, channel },
      ),
    );
  }

  @Post("versions/:applicationVersionId/submit-review")
  @HttpCode(200)
  async submitReview(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
  ) {
    return this.call(async () =>
      this.applications.submitForReview(
        await this.requireActor(employeeId, sessionId, "update"),
        versionId,
      ),
    );
  }

  @Post("versions/:applicationVersionId/review")
  @HttpCode(200)
  async review(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
    @Body()
    body: {
      decision: "approve" | "reject" | "request_changes";
      comment: string;
    },
  ) {
    return this.call(async () =>
      this.applications.review(
        await this.requireActor(employeeId, sessionId, "review"),
        versionId,
        body.decision,
        body.comment,
      ),
    );
  }

  @Post("versions/:applicationVersionId/claim-review")
  @HttpCode(200)
  async claimReview(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
  ) {
    return this.call(async () =>
      this.applications.claimReview(
        await this.requireActor(employeeId, sessionId, "review"),
        versionId,
      ),
    );
  }

  @Post("versions/:applicationVersionId/release-review")
  @HttpCode(200)
  async releaseReview(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
  ) {
    return this.call(async () =>
      this.applications.releaseReview(
        await this.requireActor(employeeId, sessionId, "review"),
        versionId,
      ),
    );
  }

  @Get("versions/:applicationVersionId/review-queue")
  async getReviewQueue(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
  ) {
    await this.requireActor(employeeId, sessionId, "read");
    return this.call(() => this.applications.getReviewQueue(versionId));
  }

  @Post(":applicationId/publish")
  @HttpCode(200)
  async publish(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { applicationVersionId: string },
  ) {
    await this.requireApplication(applicationId);
    return this.call(async () =>
      this.applications.publish(
        await this.requireActor(employeeId, sessionId, "publish"),
        body.applicationVersionId,
      ),
    );
  }

  @Post(":applicationId/withdraw")
  @HttpCode(200)
  async withdraw(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { reason: string },
  ) {
    return this.call(async () =>
      this.applications.withdraw(
        await this.requireActor(employeeId, sessionId, "publish"),
        applicationId,
        body.reason,
      ),
    );
  }

  @Post(":applicationId/rollback")
  @HttpCode(200)
  async rollback(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { applicationVersionId: string },
  ) {
    return this.call(async () =>
      this.applications.rollback(
        await this.requireActor(employeeId, sessionId, "publish"),
        applicationId,
        body.applicationVersionId,
      ),
    );
  }

  @Post(":applicationId/archive")
  @HttpCode(200)
  async archive(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.applications.archive(
        await this.requireActor(employeeId, sessionId, "publish"),
        applicationId,
      ),
    );
  }

  @Get(":applicationId")
  async getApplication(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requireActor(employeeId, sessionId, "read");
    return this.call(() => this.applications.getApplication(applicationId));
  }

  @Get(":applicationId/versions")
  async listVersions(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requireActor(employeeId, sessionId, "read");
    return this.applications.listVersions(applicationId);
  }

  @Get(":applicationId/deliveries")
  async listDeliveries(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requireActor(employeeId, sessionId, "read");
    return this.applications.listDeliveries(applicationId);
  }

  @Get(":applicationId/reviews")
  async listReviews(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requireActor(employeeId, sessionId, "read");
    return this.applications.listReviews(applicationId);
  }

  @Get(":applicationId/published-version")
  async getPublishedVersion(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requireActor(employeeId, sessionId, "read");
    return this.call(() =>
      this.applications.getPublishedVersion(applicationId),
    );
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

  private async requireApplication(applicationId: string): Promise<void> {
    try {
      await this.applications.getApplication(applicationId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    const code =
      error instanceof Error ? error.message : "APPLICATION_REQUEST_FAILED";
    if (code.endsWith("_NOT_FOUND")) throw new NotFoundException(code);
    if (code === "NOT_AUTHORIZED" || code === "SELF_REVIEW_FORBIDDEN")
      throw new ForbiddenException(code);
    throw new BadRequestException(code);
  }
}
