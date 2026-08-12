import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { DEMAND_SERVICE } from "./demand.tokens.js";
import { DemandService } from "./demand.service.js";
import {
  DemandApplicationLinkDto,
  DemandClaimRequestDto,
  DemandCollaboratorDto,
  DemandCollaboratorRequestDto,
  DemandCollaboratorRoleUpdateRequestDto,
  DemandCommentDto,
  DemandCommentRequestDto,
  DemandCreateApplicationRequestDto,
  DemandDraftRequestDto,
  DemandEntryDto,
  DemandListResultDto,
  DemandMergeRequestDto,
  DemandMergeResultDto,
  DemandPilotDto,
  DemandPilotRequestDto,
  DemandPilotUpdateRequestDto,
  DemandPriorityRequestDto,
  DemandProgressDto,
  DemandProgressRequestDto,
  DemandReportDto,
  DemandReportRequestDto,
  DemandReportResolveRequestDto,
  DemandReviewRequestDto,
  DemandStatusRequestDto,
  SaveDemandDraftRequestDto,
  DemandLinkApplicationRequestDto,
} from "./demand.dto.js";
import {
  EmployeeIdResultDto,
  LikeResultDto,
} from "../system/http/simple-results.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("需求")
@Controller("/internal/demands")
@Authenticated()
export class DemandController {
  constructor(
    @Inject(DEMAND_SERVICE) private readonly demands: DemandService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Post()
  @RequiresPermissions(PERMISSIONS.DEMAND_CREATE)
  @ApiOperation({ summary: "创建需求草稿" })
  @ApiIdentityHeaders()
  @ApiBody({ type: DemandDraftRequestDto })
  @ApiCreatedResponse({ description: "创建后的需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403])
  create(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandDraftRequestDto,
  ) {
    return this.call(async () =>
      this.demands.createDraft(await this.actor(employeeId, sessionId), body),
    );
  }

  @Patch(":demandId")
  @RequiresPermissions(PERMISSIONS.DEMAND_UPDATE)
  @ApiOperation({ summary: "保存需求草稿" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: SaveDemandDraftRequestDto })
  @ApiOkResponse({ description: "保存后的需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
  saveDraft(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: SaveDemandDraftRequestDto,
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
  @RequiresPermissions(PERMISSIONS.DEMAND_SUBMIT)
  @ApiOperation({ summary: "提交需求评审" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiCreatedResponse({ description: "提交后的需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
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
  @RequiresPermissions(PERMISSIONS.DEMAND_REVIEW)
  @ApiOperation({ summary: "评审需求" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandReviewRequestDto })
  @ApiCreatedResponse({ description: "评审后的需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
  review(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandReviewRequestDto,
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
  @RequiresPermissions(PERMISSIONS.DEMAND_CLAIM)
  @ApiOperation({ summary: "认领需求" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandClaimRequestDto })
  @ApiCreatedResponse({ description: "认领后的需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
  claim(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandClaimRequestDto,
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
  @RequiresPermissions(PERMISSIONS.DEMAND_COLLABORATE)
  @ApiOperation({ summary: "添加协作成员" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandCollaboratorRequestDto })
  @ApiCreatedResponse({
    description: "协作成员记录",
    type: DemandCollaboratorDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  addCollaborator(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandCollaboratorRequestDto,
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
  @RequiresPermissions(PERMISSIONS.DEMAND_READ)
  @ApiOperation({ summary: "协作成员列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiOkResponse({
    description: "协作成员列表",
    type: DemandCollaboratorDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
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

  @Patch(":demandId/collaborators/:collaboratorEmployeeId")
  @RequiresPermissions(PERMISSIONS.DEMAND_COLLABORATE)
  @ApiOperation({ summary: "调整协作成员角色" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiParam({ name: "collaboratorEmployeeId", description: "协作人员工工号" })
  @ApiBody({ type: DemandCollaboratorRoleUpdateRequestDto })
  @ApiOkResponse({
    description: "更新后的协作成员记录",
    type: DemandCollaboratorDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  updateCollaboratorRole(
    @Param("demandId") demandId: string,
    @Param("collaboratorEmployeeId") collaboratorEmployeeId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandCollaboratorRoleUpdateRequestDto,
  ) {
    return this.call(async () =>
      this.demands.updateCollaboratorRole(
        await this.actor(employeeId, sessionId),
        demandId,
        collaboratorEmployeeId,
        body.role,
        body.expectedVersion,
      ),
    );
  }

  @Delete(":demandId/collaborators/:collaboratorEmployeeId")
  @RequiresPermissions(PERMISSIONS.DEMAND_COLLABORATE)
  @ApiOperation({ summary: "移除协作成员" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiParam({ name: "collaboratorEmployeeId", description: "协作人员工工号" })
  @ApiQuery({ name: "expectedVersion", required: true })
  @ApiOkResponse({ description: "协作成员已移除" })
  @ApiProblemResponses([400, 401, 403, 404])
  removeCollaborator(
    @Param("demandId") demandId: string,
    @Param("collaboratorEmployeeId") collaboratorEmployeeId: string,
    @Query("expectedVersion") expectedVersion: string | undefined,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.removeCollaborator(
        await this.actor(employeeId, sessionId),
        demandId,
        collaboratorEmployeeId,
        this.parsePositive(expectedVersion, 0),
      ),
    );
  }

  @Post(":demandId/priority")
  @RequiresPermissions(PERMISSIONS.DEMAND_PRIORITIZE)
  @ApiOperation({ summary: "设置需求优先级" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandPriorityRequestDto })
  @ApiCreatedResponse({ description: "设置后的需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
  setPriority(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandPriorityRequestDto,
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
  @RequiresPermissions(PERMISSIONS.DEMAND_PROGRESS)
  @ApiOperation({ summary: "推进需求状态" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandStatusRequestDto })
  @ApiCreatedResponse({ description: "推进后的需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
  advanceStatus(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandStatusRequestDto,
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
  @RequiresPermissions(PERMISSIONS.DEMAND_PROGRESS)
  @ApiOperation({ summary: "新增进度更新" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandProgressRequestDto })
  @ApiCreatedResponse({ description: "进度更新记录", type: DemandProgressDto })
  @ApiProblemResponses([400, 401, 403, 404])
  addProgress(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandProgressRequestDto,
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
  @RequiresPermissions(PERMISSIONS.DEMAND_READ)
  @ApiOperation({ summary: "进度更新列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiOkResponse({
    description: "进度更新列表",
    type: DemandProgressDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
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
  @RequiresPermissions(PERMISSIONS.DEMAND_PROGRESS)
  @ApiOperation({ summary: "创建试点" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandPilotRequestDto })
  @ApiCreatedResponse({ description: "试点记录", type: DemandPilotDto })
  @ApiProblemResponses([400, 401, 403, 404])
  createPilot(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandPilotRequestDto,
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

  @Get(":demandId/pilots")
  @RequiresPermissions(PERMISSIONS.DEMAND_READ)
  @ApiOperation({ summary: "试点列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiOkResponse({
    description: "试点列表",
    type: DemandPilotDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  listPilots(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.listPilots(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Patch(":demandId/pilots/:pilotId")
  @RequiresPermissions(PERMISSIONS.DEMAND_PROGRESS)
  @ApiOperation({ summary: "更新试点" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiParam({ name: "pilotId", description: "试点 ID" })
  @ApiBody({ type: DemandPilotUpdateRequestDto })
  @ApiOkResponse({ description: "更新后的试点记录", type: DemandPilotDto })
  @ApiProblemResponses([400, 401, 403, 404])
  updatePilot(
    @Param("demandId") demandId: string,
    @Param("pilotId") pilotId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandPilotUpdateRequestDto,
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

  @Post(":demandId/merge")
  @RequiresPermissions(PERMISSIONS.DEMAND_MERGE)
  @ApiOperation({
    summary: "合并需求",
    description: "将当前需求合并到目标需求。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID（合并源）" })
  @ApiBody({ type: DemandMergeRequestDto })
  @ApiCreatedResponse({
    description: "合并结果（源与目标需求）",
    type: DemandMergeResultDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  merge(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandMergeRequestDto,
  ) {
    return this.call(async () =>
      this.demands.merge(
        await this.actor(employeeId, sessionId),
        demandId,
        body.targetDemandId,
        body.sourceExpectedVersion,
        body.targetExpectedVersion,
      ),
    );
  }

  @Post(":demandId/applications")
  @RequiresPermissions(PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION)
  @ApiOperation({ summary: "关联应用到需求" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandLinkApplicationRequestDto })
  @ApiCreatedResponse({
    description: "需求-应用关联记录",
    type: DemandApplicationLinkDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  linkApplication(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandLinkApplicationRequestDto,
  ) {
    return this.call(async () =>
      this.demands.linkApplication(
        await this.actor(employeeId, sessionId),
        demandId,
        body.applicationId,
        body.role,
        body.isPrimary ?? false,
        body.expectedVersion,
      ),
    );
  }

  @Post(":demandId/applications/from-demand")
  @RequiresPermissions(PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION)
  @ApiOperation({
    summary: "从需求创建应用",
    description: "为需求创建新应用并建立关联。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandCreateApplicationRequestDto })
  @ApiCreatedResponse({
    description: "需求-应用关联记录",
    type: DemandApplicationLinkDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  createApplicationFromDemand(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandCreateApplicationRequestDto,
  ) {
    return this.call(async () =>
      this.demands.createApplicationFromDemand(
        await this.actor(employeeId, sessionId),
        demandId,
        { ...body, isPrimary: body.isPrimary ?? false },
      ),
    );
  }

  @Get(":demandId/applications")
  @RequiresPermissions(PERMISSIONS.DEMAND_READ)
  @ApiOperation({ summary: "需求关联应用列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiOkResponse({
    description: "关联记录列表",
    type: DemandApplicationLinkDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  listApplicationLinks(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.listApplicationLinks(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Delete(":demandId/applications/:applicationId")
  @RequiresPermissions(PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION)
  @ApiOperation({ summary: "解除需求与应用关联" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiQuery({ name: "expectedVersion", required: true })
  @ApiOkResponse({ description: "关联已解除" })
  @ApiProblemResponses([400, 401, 403, 404])
  unlinkApplication(
    @Param("demandId") demandId: string,
    @Param("applicationId") applicationId: string,
    @Query("expectedVersion") expectedVersion: string | undefined,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.unlinkApplication(
        await this.actor(employeeId, sessionId),
        demandId,
        applicationId,
        this.parsePositive(expectedVersion, 0),
      ),
    );
  }

  @Get()
  @RequiresPermissions(PERMISSIONS.DEMAND_READ)
  @ApiOperation({
    summary: "需求列表",
    description: "按状态、关键词与分页查询可见需求。",
  })
  @ApiIdentityHeaders()
  @ApiQuery({
    name: "status",
    description: "需求状态过滤",
    required: false,
    enum: [
      "draft",
      "pending_review",
      "rejected",
      "published",
      "in_progress",
      "pilot",
      "completed",
      "closed",
      "merged",
    ],
  })
  @ApiQuery({ name: "query", description: "搜索关键词", required: false })
  @ApiQuery({
    name: "page",
    description: "页码（从 1 开始）",
    required: false,
    example: "1",
  })
  @ApiQuery({
    name: "pageSize",
    description: "每页数量",
    required: false,
    example: "20",
  })
  @ApiQuery({
    name: "sort",
    description: "排序方式",
    required: false,
    enum: ["recent", "priority", "hot"],
  })
  @ApiOkResponse({ description: "需求列表结果", type: DemandListResultDto })
  @ApiProblemResponses([400, 401, 403])
  list(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query("status") status?: Parameters<DemandService["list"]>[1]["status"],
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("requesterDepartmentId") requesterDepartmentId?: string,
    @Query("audienceType") audienceType?: "all" | "department" | "employee",
    @Query("sort") sort?: "recent" | "priority" | "hot",
  ) {
    const parsedPage = this.parsePositive(page, 1);
    const parsedPageSize = this.parsePositive(pageSize, 20);
    return this.call(async () =>
      this.demands.list(await this.actor(employeeId, sessionId), {
        ...(status === undefined ? {} : { status }),
        ...(query === undefined ? {} : { query }),
        ...(requesterDepartmentId === undefined
          ? {}
          : { requesterDepartmentId }),
        ...(audienceType === undefined ? {} : { audienceType }),
        ...(sort === undefined ? {} : { sort }),
        page: parsedPage,
        pageSize: parsedPageSize,
      }),
    );
  }

  @Get(":demandId")
  @RequiresPermissions(PERMISSIONS.DEMAND_READ)
  @ApiOperation({ summary: "需求详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiOkResponse({ description: "需求条目", type: DemandEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
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
  @RequiresPermissions(PERMISSIONS.DEMAND_INTERACT)
  @ApiOperation({ summary: "点赞/取消点赞" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiCreatedResponse({ description: "点赞后的状态", type: LikeResultDto })
  @ApiProblemResponses([400, 401, 403, 404])
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
  @RequiresPermissions(PERMISSIONS.DEMAND_READ)
  @ApiOperation({ summary: "需求评论列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiOkResponse({
    description: "评论列表",
    type: DemandCommentDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
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
  @RequiresPermissions(PERMISSIONS.DEMAND_INTERACT)
  @ApiOperation({ summary: "发表评论" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandCommentRequestDto })
  @ApiCreatedResponse({ description: "评论记录", type: DemandCommentDto })
  @ApiProblemResponses([400, 401, 403, 404])
  comment(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandCommentRequestDto,
  ) {
    return this.call(async () =>
      this.demands.addComment(await this.actor(employeeId, sessionId), {
        demandId,
        ...body,
      }),
    );
  }

  @Post(":demandId/comments/:commentId/like")
  @RequiresPermissions(PERMISSIONS.DEMAND_INTERACT)
  @ApiOperation({ summary: "评论点赞或取消点赞" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiParam({ name: "commentId", description: "评论 ID" })
  @ApiCreatedResponse({ description: "评论点赞后的状态", type: LikeResultDto })
  @ApiProblemResponses([400, 401, 403, 404])
  likeComment(
    @Param("demandId") demandId: string,
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.toggleCommentLike(
        await this.actor(employeeId, sessionId),
        demandId,
        commentId,
      ),
    );
  }

  @Post(":demandId/reports")
  @RequiresPermissions(PERMISSIONS.DEMAND_INTERACT)
  @ApiOperation({ summary: "举报需求或评论" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiBody({ type: DemandReportRequestDto })
  @ApiCreatedResponse({ description: "举报记录", type: DemandReportDto })
  @ApiProblemResponses([400, 401, 403, 404])
  report(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandReportRequestDto,
  ) {
    return this.call(async () =>
      this.demands.report(await this.actor(employeeId, sessionId), {
        demandId,
        ...body,
      }),
    );
  }

  @Get(":demandId/reports")
  @RequiresPermissions(PERMISSIONS.DEMAND_MODERATE)
  @ApiOperation({ summary: "需求举报列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiOkResponse({
    description: "举报记录列表",
    type: DemandReportDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  listReports(
    @Param("demandId") demandId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.demands.listReports(
        await this.actor(employeeId, sessionId),
        demandId,
      ),
    );
  }

  @Post(":demandId/reports/:reportId/resolve")
  @RequiresPermissions(PERMISSIONS.DEMAND_MODERATE)
  @ApiOperation({ summary: "处理需求举报" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiParam({ name: "reportId", description: "举报 ID" })
  @ApiBody({ type: DemandReportResolveRequestDto })
  @ApiCreatedResponse({
    description: "处理后的举报记录",
    type: DemandReportDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  resolveReport(
    @Param("demandId") demandId: string,
    @Param("reportId") reportId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: DemandReportResolveRequestDto,
  ) {
    return this.call(async () =>
      this.demands.resolveReport(
        await this.actor(employeeId, sessionId),
        demandId,
        reportId,
        body.status,
      ),
    );
  }

  @Get(":demandId/comments/:commentId/anonymous-author")
  @RequiresPermissions(PERMISSIONS.DEMAND_ANONYMOUS_AUDIT)
  @ApiOperation({
    summary: "查询匿名评论作者",
    description: "需要匿名审计权限。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "demandId", description: "需求 ID" })
  @ApiParam({ name: "commentId", description: "评论 ID" })
  @ApiOkResponse({ description: "作者员工工号", type: EmployeeIdResultDto })
  @ApiProblemResponses([400, 401, 403, 404])
  anonymousAuthor(
    @Param("demandId") demandId: string,
    @Param("commentId") commentId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () => ({
      employeeId: await this.demands.lookupAnonymousAuthor(
        await this.actor(employeeId, sessionId),
        demandId,
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
