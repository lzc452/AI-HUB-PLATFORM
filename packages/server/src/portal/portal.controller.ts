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
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { ActorContext } from "@ai-hub/contracts";
import { Authenticated, CurrentActor } from "../authorization/authorization.decorator.js";
import {
  CommentRequestDto,
  CreatePortalDraftDto,
  CreatePortalVersionDto,
  DashboardCommentsQueryDto,
  FavoriteRequestDto,
  HuntVoteRequestDto,
  parseResourceType,
  PortalListQueryDto,
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
  apps(@CurrentActor() actor: ActorContext, @Query() query: PortalListQueryDto) {
    return this.call(() => this.portal.list(actor, "app", toPortalListInput(query)));
  }

  @Get("apps/:ownerEmployeeId/:slug")
  app(@CurrentActor() actor: ActorContext, @Param("ownerEmployeeId") owner: string, @Param("slug") slug: string) {
    return this.call(() => this.portal.detail(actor, "app", owner, slug));
  }

  @Get("skills")
  skills(@CurrentActor() actor: ActorContext, @Query() query: PortalListQueryDto) {
    return this.call(() => this.portal.list(actor, "skill", toPortalListInput(query)));
  }

  @Get("skills/:ownerEmployeeId/:slug")
  skill(@CurrentActor() actor: ActorContext, @Param("ownerEmployeeId") owner: string, @Param("slug") slug: string) {
    return this.call(() => this.portal.detail(actor, "skill", owner, slug));
  }

  @Get("plugins")
  plugins(@CurrentActor() actor: ActorContext, @Query() query: PortalListQueryDto) {
    return this.call(() => this.portal.list(actor, "plugin", toPortalListInput(query)));
  }

  @Get("plugins/:ownerEmployeeId/:slug")
  plugin(@CurrentActor() actor: ActorContext, @Param("ownerEmployeeId") owner: string, @Param("slug") slug: string) {
    return this.call(() => this.portal.detail(actor, "plugin", owner, slug));
  }

  @Get("mcps")
  mcps(@CurrentActor() actor: ActorContext, @Query() query: PortalListQueryDto) {
    return this.call(() => this.portal.list(actor, "mcp", toPortalListInput(query)));
  }

  @Get("mcps/:slug")
  mcp(@CurrentActor() actor: ActorContext, @Param("slug") slug: string) {
    return this.call(() => this.portal.detail(actor, "mcp", null, slug));
  }

  @Post("dashboard/publish")
  createDraft(@CurrentActor() actor: ActorContext, @Body() body: CreatePortalDraftDto) {
    return this.call(() => this.portal.createDraft(actor, body));
  }

  @Put("dashboard/publish/:resourceType/:resourceId")
  updateDraft(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") resourceType: string,
    @Param("resourceId") resourceId: string,
    @Body() body: UpdatePortalDraftDto,
  ) {
    return this.call(() => this.portal.updateDraft(actor, parseResourceType(resourceType), resourceId, body));
  }

  @Post("dashboard/publish/:resourceType/:resourceId/versions")
  saveVersion(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") resourceType: string,
    @Param("resourceId") resourceId: string,
    @Body() body: CreatePortalVersionDto,
  ) {
    return this.call(() => this.portal.saveVersion(actor, parseResourceType(resourceType), resourceId, body));
  }

  @Post("dashboard/publish/:resourceType/:resourceId/submit")
  submit(@CurrentActor() actor: ActorContext, @Param("resourceType") type: string, @Param("resourceId") id: string) {
    return this.call(() => this.portal.submit(actor, parseResourceType(type), id));
  }

  @Post("dashboard/publish/:resourceType/:resourceId/approve")
  approve(@CurrentActor() actor: ActorContext, @Param("resourceType") type: string, @Param("resourceId") id: string) {
    return this.call(() => this.portal.approve(actor, parseResourceType(type), id));
  }

  @Post("dashboard/publish/:resourceType/:resourceId/request-changes")
  requestChanges(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
  ) {
    return this.call(() => this.portal.requestChanges(actor, parseResourceType(type), id));
  }

  @Post("dashboard/publish/:resourceType/:resourceId/publish")
  publish(@CurrentActor() actor: ActorContext, @Param("resourceType") type: string, @Param("resourceId") id: string) {
    return this.call(() => this.portal.publish(actor, parseResourceType(type), id));
  }

  @Post("dashboard/publish/:resourceType/:resourceId/withdraw")
  withdraw(@CurrentActor() actor: ActorContext, @Param("resourceType") type: string, @Param("resourceId") id: string) {
    return this.call(() => this.portal.withdraw(actor, parseResourceType(type), id));
  }

  @Post(":resourceType/:resourceId/favorite")
  favorite(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
    @Body() body: FavoriteRequestDto,
  ) {
    return this.call(() => this.portal.favorite(actor, parseResourceType(type), id, body.active));
  }

  @Get(":resourceType/:resourceId/comments")
  comments(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
  ) {
    return this.call(() => this.portal.listComments(actor, parseResourceType(type), id));
  }

  @Post(":resourceType/:resourceId/comments")
  comment(
    @CurrentActor() actor: ActorContext,
    @Param("resourceType") type: string,
    @Param("resourceId") id: string,
    @Body() body: CommentRequestDto,
  ) {
    return this.call(() => this.portal.createComment(actor, parseResourceType(type), id, body.body, body.parentCommentId ?? null));
  }

  @Get("dashboard")
  dashboard(@CurrentActor() actor: ActorContext) {
    return this.call(() => this.portal.dashboard(actor));
  }

  @Get("dashboard/stars")
  stars(@CurrentActor() actor: ActorContext, @Query() query: PortalListQueryDto) {
    const input = toPortalListInput(query);
    return this.call(() => this.portal.stars(actor, input.page, input.pageSize));
  }

  @Get("dashboard/comments")
  dashboardComments(@CurrentActor() actor: ActorContext, @Query() query: DashboardCommentsQueryDto) {
    return this.call(() => this.portal.dashboardComments(actor, toDashboardCommentQuery(query)));
  }

  @Get("departments")
  departments() {
    return this.call(() => this.portal.departments());
  }

  @Get("departments/:departmentId")
  department(@CurrentActor() actor: ActorContext, @Param("departmentId") departmentId: string) {
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
  hunt() {
    return this.call(() => this.portal.hunt());
  }

  @Post("apps-hunt/votes")
  voteHunt(@CurrentActor() actor: ActorContext, @Body() body: HuntVoteRequestDto) {
    return this.call(() => this.portal.voteHunt(actor, body.periodId, body.entryId));
  }

  @Get("docs/:pageKey")
  doc(@Param("pageKey") pageKey: string) {
    if (pageKey !== "tutorials" && pageKey !== "about" && pageKey !== "updates") {
      throw new NotFoundException("PORTAL_CONTENT_PAGE_NOT_FOUND");
    }
    return this.call(() => this.portal.doc(pageKey));
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const code = error instanceof Error ? error.message : "PORTAL_REQUEST_FAILED";
      if (code.includes("NOT_FOUND")) throw new NotFoundException(code);
      if (code.includes("FORBIDDEN") || code.includes("OWNER_REQUIRED") || code.includes("SELF_REVIEW")) {
        throw new ForbiddenException(code);
      }
      throw new BadRequestException(code);
    }
  }
}
