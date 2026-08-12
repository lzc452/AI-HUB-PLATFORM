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
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { FEEDBACK_SERVICE } from "./feedback.tokens.js";
import { FeedbackService } from "./feedback.service.js";
import {
  CreateFeedbackRequestDto,
  FeedbackDto,
  UpdateFeedbackRequestDto,
} from "./feedback.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("应用反馈")
@Controller("/internal/applications")
@Authenticated()
export class FeedbackController {
  constructor(
    @Inject(FEEDBACK_SERVICE) private readonly feedback: FeedbackService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Post(":applicationId/interactions/feedback")
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({ summary: "提交应用反馈" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: CreateFeedbackRequestDto })
  @ApiCreatedResponse({ description: "反馈记录", type: FeedbackDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async create(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: CreateFeedbackRequestDto,
  ) {
    return this.call(async () =>
      this.feedback.createFeedback(await this.actor(employeeId, sessionId), {
        applicationId,
        ...body,
      }),
    );
  }

  @Get(":applicationId/interactions/feedback")
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({ summary: "我的应用反馈列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({
    description: "当前用户在该应用下提交的反馈",
    type: FeedbackDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listMine(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.feedback.listMyFeedback(
        await this.actor(employeeId, sessionId),
        applicationId,
      ),
    );
  }

  @Patch(":applicationId/interactions/feedback/:feedbackId")
  @RequiresPermissions(PERMISSIONS.INTERACTION_MODERATE)
  @ApiOperation({ summary: "更新反馈处理状态（所有者/维护者）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "feedbackId", description: "反馈 ID" })
  @ApiBody({ type: UpdateFeedbackRequestDto })
  @ApiOkResponse({ description: "更新后的反馈记录", type: FeedbackDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async update(
    @Param("applicationId") applicationId: string,
    @Param("feedbackId") feedbackId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: UpdateFeedbackRequestDto,
  ) {
    return this.call(async () =>
      this.feedback.updateFeedbackStatus(
        await this.actor(employeeId, sessionId),
        { applicationId, feedbackId, ...body },
      ),
    );
  }

  private async actor(
    employeeId: string | undefined,
    sessionId: string | undefined,
  ): Promise<ActorContext> {
    if (employeeId === undefined || sessionId === undefined)
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    const actor = await this.identity.getActorContext(employeeId, sessionId);
    const decision = await this.identity.authorize({
      actor,
      action: "read",
      resourceType: "application",
    });
    if (!decision.allowed) throw new ForbiddenException("NOT_AUTHORIZED");
    return actor;
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
      error instanceof Error ? error.message : "FEEDBACK_REQUEST_FAILED";
    if (code.endsWith("_NOT_FOUND")) throw new NotFoundException(code);
    if (code === "NOT_AUTHORIZED" || code.endsWith("_FORBIDDEN"))
      throw new ForbiddenException(code);
    throw new BadRequestException(code);
  }
}
