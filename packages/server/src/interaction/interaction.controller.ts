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
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { INTERACTION_SERVICE } from "./interaction.tokens.js";
import { InteractionService } from "./interaction.service.js";
import {
  CommentRecordDto,
  CommentRequestDto,
  RatingRecordDto,
  RatingRequestDto,
  ReportRecordDto,
  ReportRequestDto,
  ResolveReportRequestDto,
} from "./interaction.dto.js";
import { LikeResultDto } from "../system/http/simple-results.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("互动")
@Controller("/internal/applications/:applicationId/interactions")
@Authenticated()
export class InteractionController {
  constructor(
    @Inject(INTERACTION_SERVICE)
    private readonly interactions: InteractionService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Post("like")
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({ summary: "点赞/取消点赞" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiCreatedResponse({ description: "点赞后的状态", type: LikeResultDto })
  @ApiProblemResponses([400, 401, 403])
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
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({ summary: "提交或更新评分" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: RatingRequestDto })
  @ApiCreatedResponse({ description: "评分记录", type: RatingRecordDto })
  @ApiProblemResponses([400, 401, 403])
  rate(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: RatingRequestDto,
  ) {
    return this.call(async () =>
      this.interactions.rate(await this.actor(employeeId, sessionId), {
        applicationId,
        ...body,
      }),
    );
  }

  @Post("comments")
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({
    summary: "官方回复评论",
    description: "仅应用所有者或维护者可回复。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: CommentRequestDto })
  @ApiCreatedResponse({ description: "评论记录", type: CommentRecordDto })
  @ApiProblemResponses([400, 401, 403])
  reply(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: CommentRequestDto,
  ) {
    return this.call(async () =>
      this.interactions.reply(await this.actor(employeeId, sessionId), {
        applicationId,
        ...body,
      }),
    );
  }

  @Post("comments/:commentId/reports")
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({ summary: "举报评论" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "commentId", description: "评论 ID" })
  @ApiBody({ type: ReportRequestDto })
  @ApiCreatedResponse({ description: "举报记录", type: ReportRecordDto })
  @ApiProblemResponses([400, 401, 403])
  report(
    @Param("applicationId") applicationId: string,
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: ReportRequestDto,
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
  @RequiresPermissions(PERMISSIONS.INTERACTION_MODERATE)
  @ApiOperation({ summary: "处理举报" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "reportId", description: "举报 ID" })
  @ApiBody({ type: ResolveReportRequestDto })
  @ApiCreatedResponse({
    description: "处理后的举报记录",
    type: ReportRecordDto,
  })
  @ApiProblemResponses([400, 401, 403])
  resolveReport(
    @Param("applicationId") _applicationId: string,
    @Param("reportId") reportId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: ResolveReportRequestDto,
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
  @RequiresPermissions(PERMISSIONS.INTERACTION_ANONYMOUS_AUDIT)
  @ApiOperation({
    summary: "查询匿名评论作者",
    description: "需要匿名审计权限。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "commentId", description: "评论 ID" })
  @ApiOkResponse({ description: "作者员工工号", schema: { type: "string" } })
  @ApiProblemResponses([400, 401, 403])
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
