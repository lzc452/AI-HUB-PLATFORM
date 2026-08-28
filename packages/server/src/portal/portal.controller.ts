import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  CurrentActor,
} from "../authorization/authorization.decorator.js";
import {
  DraftValidationError,
  type DraftValidationIssue,
} from "../application/application.service.js";
import { ApiProblemResponses } from "../system/http/api-docs.decorator.js";
import {
  CommentRequestDto,
  CreatePortalDraftDto,
  CreatePortalVersionDto,
  DashboardCommentsQueryDto,
  FavoriteRequestDto,
  HuntVoteRequestDto,
  parseResourceType,
  PortalListQueryDto,
  PortalReviewRequestDto,
  PortalWithdrawRequestDto,
  PortalApplicationDraftDetailDto,
  PortalHuntEntryDto,
  UpdatePortalDraftDto,
  toDashboardCommentQuery,
  toPortalListInput,
} from "./portal.dto.js";
import { PortalService } from "./portal.service.js";
import { PORTAL_SERVICE } from "./portal.tokens.js";

@ApiTags("AI Hub Portal")
@Controller("/internal/portal")
@Authenticated()
export class PortalController {
  constructor(@Inject(PORTAL_SERVICE) private readonly portal: PortalService) {}

  @Get("home")
  @ApiOperation({ summary: "门户首页聚合数据" })
  home(@CurrentActor() actor: ActorContext) {
    return this.call(() => this.portal.home(actor));
  }

  @Get("apps")
  apps(
    @CurrentActor() actor: ActorContext,
    @Query() query: PortalListQueryDto,
  ) {
    return this.call(() =>
      this.portal.list(actor, "app", toPortalListInput(query)),
    );
  }

  @Get("apps/:ownerEmployeeId/:slug")
  app(
    @CurrentActor() actor: ActorContext,
    @Param("ownerEmployeeId") owner: string,
    @Param("slug") slug: string,
  ) {
    return this.call(() => this.portal.detail(actor, "app", owner, slug));
  }

  @Get("skills")
  skills(
    @CurrentActor() actor: ActorContext,
    @Query() query: PortalListQueryDto,
  ) {
    return this.call(() =>
      this.portal.list(actor, "skill", toPortalListInput(query)),
    );
  }

  @Get("skills/:ownerEmployeeId/:slug")
  skill(
    @CurrentActor() actor: ActorContext,
    @Param("ownerEmployeeId") owner: string,
    @Param("slug") slug: string,
  ) {
    return this.call(() => this.portal.detail(actor, "skill", owner, slug));
  }

  @Get("plugins")
  plugins(
    @CurrentActor() actor: ActorContext,
    @Query() query: PortalListQueryDto,
  ) {
    return this.call(() =>
      this.portal.list(actor, "plugin", toPortalListInput(query)),
    );
  }

  @Get("plugins/:ownerEmployeeId/:slug")
  plugin(
    @CurrentActor() actor: ActorContext,
    @Param("ownerEmployeeId") owner: string,
    @Param("slug") slug: string,
  ) {
    return this.call(() => this.portal.detail(actor, "plugin", owner, slug));
  }

  @Get("mcps")
  mcps(
    @CurrentActor() actor: ActorContext,
    @Query() query: PortalListQueryDto,
  ) {
    return this.call(() =>
      this.portal.list(actor, "mcp", toPortalListInput(query)),
    );
  }

  @Get("mcps/:slug")
  mcp(@CurrentActor() actor: ActorContext, @Param("slug") slug: string) {
    return this.call(() => this.portal.detail(actor, "mcp", null, slug));
  }

  @Post("dashboard/publish")
  @ApiOperation({
    summary: "创建 Portal 发布草稿",
    description:
      "resourceType=app 时创建标准应用；完整 applicationDraft 或兼容完整 metadata 将走 ApplicationService.saveDraft。",
  })
  @ApiBody({ type: CreatePortalDraftDto })
  @ApiProblemResponses([400, 401, 403, 404])
  createDraft(
    @CurrentActor() actor: ActorContext,
    @Body() body: CreatePortalDraftDto,
  ) {
    return this.call(() => this.portal.createDraft(actor, body));
  }

  @Put("dashboard/publish/:resourceType/:resourceId")
  @ApiOperation({
    summary: "更新 Portal 发布草稿",
    description:
      "resourceType=app 必须提供完整 applicationDraft（或兼容完整 metadata），并复用标准应用草稿校验。",
  })
  @ApiBody({ type: UpdatePortalDraftDto })
  @ApiProblemResponses([400, 401, 403, 404])
  updateDraft(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") resourceType: string,
    @Param("resourceId") resourceId: string,
    @Body() body: UpdatePortalDraftDto,
  ) {
    return this.call(() =>
      this.portal.updateDraft(
        actor,
        parseResourceType(resourceType),
        resourceId,
        body,
      ),
    );
  }

  @Get("dashboard/publish/app/:applicationId")
  @ApiOperation({ summary: "读取 Portal 应用草稿" })
  @ApiOkResponse({ type: PortalApplicationDraftDetailDto })
  @ApiProblemResponses([400, 401, 403, 404])
  draft(
    @CurrentActor() actor: ActorContext,
    @Param("applicationId") applicationId: string,
  ) {
    return this.call(() => this.portal.draft(actor, applicationId));
  }

  @Post("dashboard/publish/:resourceType/:resourceId/versions")
  @ApiOperation({
    summary: "保存 Portal 版本信息",
    description:
      "resourceType=app 仅更新草稿 version/changelog；正式版本在提交审核时原子创建。",
  })
  @ApiBody({ type: CreatePortalVersionDto })
  @ApiProblemResponses([400, 401, 403, 404])
  saveVersion(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") resourceType: string,
    @Param("resourceId") resourceId: string,
    @Body() body: CreatePortalVersionDto,
  ) {
    return this.call(() =>
      this.portal.saveVersion(
        actor,
        parseResourceType(resourceType),
        resourceId,
        body,
      ),
    );
  }

  @Post("dashboard/publish/:resourceType/:resourceId/submit")
  @ApiOperation({
    summary: "提交 Portal 资源审核",
    description:
      "resourceType=app 会执行标准草稿校验；失败时返回 DRAFT_VALIDATION_FAILED 与 issues。",
  })
  @ApiProblemResponses([400, 401, 403, 404])
  submit(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
  ) {
    return this.call(() =>
      this.portal.submit(actor, parseResourceType(type), id),
    );
  }

  @Post("dashboard/publish/:resourceType/:resourceId/approve")
  @ApiOperation({ summary: "批准 Portal 资源；app 使用标准应用审核链路" })
  @ApiBody({ type: PortalReviewRequestDto, required: false })
  @ApiProblemResponses([400, 401, 403, 404])
  approve(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
    @Body() body: PortalReviewRequestDto | undefined,
  ) {
    return this.call(() =>
      this.portal.approve(actor, parseResourceType(type), id, body?.comment),
    );
  }

  @Post("dashboard/publish/:resourceType/:resourceId/request-changes")
  @ApiOperation({ summary: "要求 Portal 资源修改；app 使用标准应用审核链路" })
  @ApiBody({ type: PortalReviewRequestDto, required: false })
  @ApiProblemResponses([400, 401, 403, 404])
  requestChanges(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
    @Body() body: PortalReviewRequestDto | undefined,
  ) {
    return this.call(() =>
      this.portal.requestChanges(
        actor,
        parseResourceType(type),
        id,
        body?.comment,
      ),
    );
  }

  @Post("dashboard/publish/:resourceType/:resourceId/publish")
  @ApiOperation({ summary: "发布 Portal 资源；app 仅处理遗留 approved 状态" })
  @ApiProblemResponses([400, 401, 403, 404])
  publish(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
  ) {
    return this.call(() =>
      this.portal.publish(actor, parseResourceType(type), id),
    );
  }

  @Post("dashboard/publish/:resourceType/:resourceId/withdraw")
  @ApiOperation({ summary: "下架 Portal 资源；app 使用标准应用下架链路" })
  @ApiBody({ type: PortalWithdrawRequestDto, required: false })
  @ApiProblemResponses([400, 401, 403, 404])
  withdraw(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
    @Body() body: PortalWithdrawRequestDto | undefined,
  ) {
    return this.call(() =>
      this.portal.withdraw(actor, parseResourceType(type), id, body?.reason),
    );
  }

  @Post(":resourceType/:resourceId/favorite")
  favorite(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
    @Body() body: FavoriteRequestDto,
  ) {
    return this.call(() =>
      this.portal.favorite(actor, parseResourceType(type), id, body.active),
    );
  }

  @Get(":resourceType/:resourceId/comments")
  comments(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
  ) {
    return this.call(() =>
      this.portal.listComments(actor, parseResourceType(type), id),
    );
  }

  @Post(":resourceType/:resourceId/comments")
  comment(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
    @Body() body: CommentRequestDto,
  ) {
    return this.call(() =>
      this.portal.createComment(
        actor,
        parseResourceType(type),
        id,
        body.body,
        body.parentCommentId ?? null,
      ),
    );
  }

  @Get("dashboard")
  dashboard(@CurrentActor() actor: ActorContext) {
    return this.call(() => this.portal.dashboard(actor));
  }

  @Get("dashboard/stars")
  stars(
    @CurrentActor() actor: ActorContext,
    @Query() query: PortalListQueryDto,
  ) {
    const input = toPortalListInput(query);
    return this.call(() =>
      this.portal.stars(actor, input.page, input.pageSize),
    );
  }

  @Get("dashboard/comments")
  dashboardComments(
    @CurrentActor() actor: ActorContext,
    @Query() query: DashboardCommentsQueryDto,
  ) {
    return this.call(() =>
      this.portal.dashboardComments(actor, toDashboardCommentQuery(query)),
    );
  }

  @Get("departments")
  departments() {
    return this.call(() => this.portal.departments());
  }

  @Get("departments/:departmentId")
  department(
    @CurrentActor() actor: ActorContext,
    @Param("departmentId") departmentId: string,
  ) {
    return this.call(() => this.portal.department(actor, departmentId));
  }

  @Get("skill-packages")
  skillPackages() {
    return this.call(() => this.portal.skillPackages());
  }

  @Get("skill-packages/:packageSlug")
  skillPackage(@Param("packageSlug") packageSlug: string) {
    return this.call(() => this.portal.skillPackage(packageSlug));
  }

  @Get("apps-hunt")
  @ApiOkResponse({ type: PortalHuntEntryDto, isArray: true })
  hunt(@CurrentActor() actor: ActorContext) {
    return this.call(() => this.portal.hunt(actor));
  }

  @Post("apps-hunt/votes")
  voteHunt(
    @CurrentActor() actor: ActorContext,
    @Body() body: HuntVoteRequestDto,
  ) {
    return this.call(() =>
      this.portal.voteHunt(actor, body.periodId, body.entryId),
    );
  }

  @Get("docs/:pageKey")
  doc(@Param("pageKey") pageKey: string) {
    if (
      pageKey !== "tutorials" &&
      pageKey !== "about" &&
      pageKey !== "updates"
    ) {
      throw new NotFoundException("PORTAL_CONTENT_PAGE_NOT_FOUND");
    }
    return this.call(() => this.portal.doc(pageKey));
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isDraftValidationError(error)) {
        throw new BadRequestException({
          code: "DRAFT_VALIDATION_FAILED",
          detail: "草稿未通过提交校验",
          issues: error.issues,
        });
      }
      const code =
        error instanceof Error ? error.message : "PORTAL_REQUEST_FAILED";
      if (code.includes("NOT_FOUND")) throw new NotFoundException(code);
      if (
        code.includes("FORBIDDEN") ||
        code.includes("OWNER_REQUIRED") ||
        code.includes("SELF_REVIEW")
      ) {
        throw new ForbiddenException(code);
      }
      throw new BadRequestException(code);
    }
  }
}

/**
 * 测试/模块边界可能加载到不同的 ApplicationService 模块实例；除 instanceof 外也
 * 识别稳定错误码和结构，确保标准草稿问题不会在 Portal 包装层丢失。
 */
function isDraftValidationError(
  error: unknown,
): error is Pick<DraftValidationError, "issues"> {
  if (error instanceof DraftValidationError) return true;
  if (
    !(error instanceof Error) ||
    error.message !== "DRAFT_VALIDATION_FAILED"
  ) {
    return false;
  }
  const issues = (error as { issues?: unknown }).issues;
  return (
    Array.isArray(issues) &&
    issues.every(
      (issue): issue is DraftValidationIssue =>
        typeof issue === "object" &&
        issue !== null &&
        typeof (issue as { code?: unknown }).code === "string" &&
        typeof (issue as { message?: unknown }).message === "string",
    )
  );
}
