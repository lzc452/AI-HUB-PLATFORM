import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { ActorContext, DemandStatus } from "@ai-hub/contracts";
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

  @Post(":demandId/claim")
  claim(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { expectedVersion: number },
  ) {
    return this.call(async () =>
      this.demands.claim(
        await this.actor(employeeId, sessionId),
        demandId,
        body.expectedVersion,
      ),
    );
  }

  @Post(":demandId/collaborators")
  addCollaborator(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      employeeId: string;
      role: "collaborator" | "operator";
      expectedVersion: number;
    },
  ) {
    return this.call(async () =>
      this.demands.addCollaborator(
        await this.actor(employeeId, sessionId),
        demandId,
        body.employeeId,
        body.role,
        body.expectedVersion,
      ),
    );
  }

  @Get(":demandId/collaborators")
  collaborators(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.listCollaborators(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Post(":demandId/priority")
  setPriority(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      expectedVersion: number;
      businessValue: number;
      implementationCost: number;
      riskLevel: number;
      adminPriority: number;
    },
  ) {
    const { expectedVersion, ...input } = body;
    return this.call(async () =>
      this.demands.setPriority(
        await this.actor(employeeId, sessionId),
        demandId,
        expectedVersion,
        input,
      ),
    );
  }

  @Post(":demandId/status")
  advanceStatus(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      expectedVersion: number;
      nextStatus: DemandStatus;
      reason?: string;
    },
  ) {
    return this.call(async () =>
      this.demands.advanceStatus(
        await this.actor(employeeId, sessionId),
        demandId,
        body.expectedVersion,
        body.nextStatus,
        body.reason,
      ),
    );
  }

  @Post(":demandId/progress")
  addProgress(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { title: string; body: string },
  ) {
    return this.call(async () =>
      this.demands.addProgressUpdate(
        await this.actor(employeeId, sessionId),
        demandId,
        body,
      ),
    );
  }

  @Get(":demandId/progress")
  listProgress(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.listProgressUpdates(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Post(":demandId/pilots")
  createPilot(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      applicationId?: string;
      name: string;
      startsAt: string;
      endsAt?: string;
    },
  ) {
    return this.call(async () =>
      this.demands.createPilot(
        await this.actor(employeeId, sessionId),
        demandId,
        {
          ...(body.applicationId === undefined
            ? {}
            : { applicationId: body.applicationId }),
          name: body.name,
          startsAt: new Date(body.startsAt),
          ...(body.endsAt === undefined
            ? {}
            : { endsAt: new Date(body.endsAt) }),
        },
      ),
    );
  }

  @Patch(":demandId/pilots/:pilotId")
  updatePilot(
    @Param("demandId") demandId: string,
    @Param("pilotId") pilotId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      endsAt?: string | null;
      outcome?: string | null;
      status?: "planned" | "running" | "completed" | "cancelled";
    },
  ) {
    return this.call(async () =>
      this.demands.updatePilot(
        await this.actor(employeeId, sessionId),
        demandId,
        pilotId,
        {
          ...(body.endsAt === undefined
            ? {}
            : { endsAt: body.endsAt === null ? null : new Date(body.endsAt) }),
          ...(body.outcome === undefined ? {} : { outcome: body.outcome }),
          ...(body.status === undefined ? {} : { status: body.status }),
        },
      ),
    );
  }

  @Get()
  list(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query("status") status?: Parameters<DemandService["list"]>[1]["status"],
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sort") sort?: "recent" | "priority",
  ) {
    const parsedPage = this.parsePositive(page, 1);
    const parsedPageSize = this.parsePositive(pageSize, 20);
    return this.call(async () =>
      this.demands.list(await this.actor(employeeId, sessionId), {
        ...(status === undefined ? {} : { status }),
        ...(query === undefined ? {} : { query }),
        ...(sort === undefined ? {} : { sort }),
        page: parsedPage,
        pageSize: parsedPageSize,
      }),
    );
  }

  @Get(":demandId")
  detail(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.getDetail(await this.actor(employeeId, sessionId), demandId),
    );
  }

  @Post(":demandId/like")
  like(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.toggleLike(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Get(":demandId/comments")
  comments(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.listComments(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Post(":demandId/comments")
  comment(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      parentCommentId: string | null;
      body: string;
      displayAnonymously?: boolean;
    },
  ) {
    return this.call(async () =>
      this.demands.addComment(await this.actor(employeeId, sessionId), {
        demandId,
        ...body,
      }),
    );
  }

  @Post(":demandId/reports")
  report(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { commentId: string | null; reason: string },
  ) {
    return this.call(async () =>
      this.demands.report(await this.actor(employeeId, sessionId), {
        demandId,
        ...body,
      }),
    );
  }

  @Post(":demandId/reports/:reportId/resolve")
  resolveReport(
    @Param("reportId") reportId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { status: "dismissed" | "hidden" | "restored" },
  ) {
    return this.call(async () =>
      this.demands.resolveReport(
        await this.actor(employeeId, sessionId),
        reportId,
        body.status,
      ),
    );
  }

  @Get(":demandId/comments/:commentId/anonymous-author")
  anonymousAuthor(
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () => ({
      employeeId: await this.demands.lookupAnonymousAuthor(
        await this.actor(employeeId, sessionId),
        commentId,
      ),
    }));
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
        code === "DEMAND_MODERATION_FORBIDDEN" ||
        code === "DEMAND_OWNER_REQUIRED" ||
        code === "DEMAND_PRIORITY_FORBIDDEN" ||
        code === "DEMAND_PROGRESS_FORBIDDEN" ||
        code === "DEMAND_NOT_AUTHORIZED"
      ) {
        throw new ForbiddenException(code);
      }
      throw new BadRequestException(code);
    }
  }

  private parsePositive(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException("DEMAND_PAGINATION_INVALID");
    }
    return parsed;
  }
}
