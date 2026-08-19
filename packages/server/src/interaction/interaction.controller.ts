import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Get,
  Query,
  Body,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
  PaginatedCommentsDto,
  PaginatedRatingsDto,
  RatingRecordDto,
  RatingRequestDto,
  ReportRecordDto,
  ReportRequestDto,
  ResolveReportRequestDto,
  ListCommentsQueryDto,
  ListRatingsQueryDto,
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
    summary: "发表评论 / 官方回复",
    description:
      "parentCommentId 为 null 时创建根评论（普通员工可发）；提供父评论 ID 时仅应用所有者/维护者可进行官方回复。",
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
    if (body.parentCommentId === null || body.parentCommentId === undefined) {
      return this.call(async () =>
        this.interactions.createComment(
          await this.actor(employeeId, sessionId),
          { applicationId, body: body.body },
        ),
      );
    }
    return this.call(async () =>
      this.interactions.replyComment(await this.actor(employeeId, sessionId), {
        applicationId,
        parentCommentId: body.parentCommentId as string,
        body: body.body,
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

  @Get("ratings")
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({ summary: "查询应用评分列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiQuery({ name: "page", type: Number, required: false })
  @ApiQuery({ name: "pageSize", type: Number, required: false })
  @ApiOkResponse({
    description: "分页评分列表",
    type: PaginatedRatingsDto,
  })
  @ApiProblemResponses([400, 401, 403])
  listRatings(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query() query: ListRatingsQueryDto,
  ) {
    const p = this.parsePositive(query.page, 1);
    const ps = this.parsePositive(query.pageSize, 20);
    return this.call(async () =>
      this.interactions.listRatings(
        await this.actor(employeeId, sessionId),
        applicationId,
        p,
        ps,
      ),
    );
  }

  @Get("comments")
  @RequiresPermissions(PERMISSIONS.INTERACTION_INTERACT)
  @ApiOperation({ summary: "查询应用评论列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiQuery({ name: "page", type: Number, required: false })
  @ApiQuery({ name: "pageSize", type: Number, required: false })
  @ApiOkResponse({
    description: "分页评论列表（含回复）",
    type: PaginatedCommentsDto,
  })
  @ApiProblemResponses([400, 401, 403])
  listComments(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query() query: ListCommentsQueryDto,
  ) {
    const p = this.parsePositive(query.page, 1);
    const ps = this.parsePositive(query.pageSize, 20);
    return this.call(async () =>
      this.interactions.listComments(
        await this.actor(employeeId, sessionId),
        applicationId,
        p,
        ps,
      ),
    );
  }

  @Post("comments/:commentId/hide")
  @RequiresPermissions(PERMISSIONS.INTERACTION_MODERATE)
  @ApiOperation({ summary: "隐藏评论" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "commentId", description: "评论 ID" })
  @ApiCreatedResponse({
    description: "隐藏后的评论记录",
    type: CommentRecordDto,
  })
  @ApiProblemResponses([400, 401, 403])
  hideComment(
    @Param("applicationId") applicationId: string,
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.interactions.hideComment(
        await this.actor(employeeId, sessionId),
        applicationId,
        commentId,
      ),
    );
  }

  @Post("comments/:commentId/restore")
  @RequiresPermissions(PERMISSIONS.INTERACTION_MODERATE)
  @ApiOperation({ summary: "恢复评论" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "commentId", description: "评论 ID" })
  @ApiCreatedResponse({
    description: "恢复后的评论记录",
    type: CommentRecordDto,
  })
  @ApiProblemResponses([400, 401, 403])
  restoreComment(
    @Param("applicationId") applicationId: string,
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.interactions.restoreComment(
        await this.actor(employeeId, sessionId),
        applicationId,
        commentId,
      ),
    );
  }

  private parsePositive(
    raw: string | number | undefined,
    fallback: number,
  ): number {
    if (raw === undefined) return fallback;
    const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
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
      const code =
        error instanceof Error ? error.message : "INTERACTION_REQUEST_FAILED";
      if (code.endsWith("_NOT_FOUND")) throw new NotFoundException(code);
      if (code === "NOT_AUTHORIZED" || code.endsWith("_FORBIDDEN")) {
        throw new ForbiddenException(code);
      }
      throw new BadRequestException(code);
    }
  }
}
