import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
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
import { APPLICATION_SERVICE } from "./application.tokens.js";
import {
  ApplicationService,
  DraftValidationError,
} from "./application.service.js";
import {
  ApplicationDto,
  ApplicationAdminKpisDto,
  ApplicationAdminListResultDto,
  ApplicationDraftRecordDto,
  ApplicationVersionDto,
  ApplicationWorkspaceDto,
  ConfigureDeliveryRequestDto,
  CreateApplicationRequestDto,
  CreateVersionRequestDto,
  DeliveryDto,
  PublishRequestDto,
  ReviewDto,
  ReviewQueueDto,
  ReviewRequestDto,
  ReviewWithdrawRequestDto,
  RollbackRequestDto,
  SaveApplicationDraftRequestDto,
  TransferOwnerRequestDto,
  WithdrawRequestDto,
} from "./application.dto.js";
import type { ApplicationDraft } from "@ai-hub/contracts";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("应用")
@Controller("/internal/applications")
@Authenticated()
export class ApplicationController {
  constructor(
    @Inject(APPLICATION_SERVICE)
    private readonly applications: ApplicationService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Post()
  @RequiresPermissions(PERMISSIONS.APPLICATION_CREATE)
  @ApiOperation({ summary: "创建应用" })
  @ApiIdentityHeaders()
  @ApiBody({ type: CreateApplicationRequestDto })
  @ApiCreatedResponse({ description: "创建后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403])
  async create(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: CreateApplicationRequestDto,
  ) {
    return this.call(async () =>
      this.applications.createApplication(
        await this.requireActor(employeeId, sessionId, "create"),
        body,
      ),
    );
  }

  @Put(":applicationId/draft")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({
    summary: "保存应用草稿",
    description: "整表单一份 draft，全量幂等保存。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: SaveApplicationDraftRequestDto })
  @ApiOkResponse({
    description: "保存后的草稿记录",
    type: ApplicationDraftRecordDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async saveDraft(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: SaveApplicationDraftRequestDto,
  ) {
    return this.call(async () =>
      this.applications.saveDraft(
        await this.requireActor(employeeId, sessionId, "update"),
        applicationId,
        body as unknown as ApplicationDraft,
      ),
    );
  }

  @Get(":applicationId/draft")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({
    summary: "读取应用草稿",
    description: "回显整表单草稿内容。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "草稿记录", type: ApplicationDraftRecordDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getDraft(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.applications.getDraft(
        await this.requireActor(employeeId, sessionId, "update"),
        applicationId,
      ),
    );
  }

  @Post(":applicationId/submit-draft")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({
    summary: "提交草稿进入审核",
    description:
      "完整性校验通过后规范化落库、创建无安装包版本并进入人工审核队列；校验失败返回 400 与问题列表。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "提交后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async submitDraft(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.applications.submitDraft(
        await this.requireActor(employeeId, sessionId, "update"),
        applicationId,
      ),
    );
  }

  @Post(":applicationId/versions")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "创建应用版本" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: CreateVersionRequestDto })
  @ApiCreatedResponse({
    description: "创建后的版本记录",
    type: ApplicationVersionDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async createVersion(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: CreateVersionRequestDto,
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({ summary: "配置交付渠道" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({
    name: "channel",
    description: "交付渠道",
    enum: ["web", "desktop", "mobile", "mini_program"],
  })
  @ApiBody({ type: ConfigureDeliveryRequestDto })
  @ApiOkResponse({ description: "配置后的交付记录", type: DeliveryDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async configureDelivery(
    @Param("applicationId") applicationId: string,
    @Param("channel") channel: "web" | "desktop" | "mobile" | "mini_program",
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: ConfigureDeliveryRequestDto,
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({ summary: "提交版本评审" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationVersionId", description: "应用版本 ID" })
  @ApiOkResponse({ description: "提交后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
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

  @Post("versions/:applicationVersionId/review-withdraw")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({
    summary: "撤回待审核版本",
    description:
      "提交人在最终审核结论前撤回自己的待审核版本：审核队列置为 completed、pending_version_id 清空、应用保持 published。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationVersionId", description: "应用版本 ID" })
  @ApiBody({ type: ReviewWithdrawRequestDto, required: false })
  @ApiOkResponse({ description: "撤回后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async withdrawPendingReview(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
  ) {
    return this.call(async () =>
      this.applications.cancelPendingReview(
        await this.requireActor(employeeId, sessionId, "update"),
        versionId,
      ),
    );
  }

  @Post("versions/:applicationVersionId/review")
  @RequiresPermissions(PERMISSIONS.APPLICATION_REVIEW)
  @HttpCode(200)
  @ApiOperation({ summary: "评审版本" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationVersionId", description: "应用版本 ID" })
  @ApiBody({ type: ReviewRequestDto })
  @ApiOkResponse({ description: "评审后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async review(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
    @Body() body: ReviewRequestDto,
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_REVIEW)
  @HttpCode(200)
  @ApiOperation({ summary: "认领评审" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationVersionId", description: "应用版本 ID" })
  @ApiOkResponse({ description: "认领后的评审队列记录", type: ReviewQueueDto })
  @ApiProblemResponses([400, 401, 403, 404])
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_REVIEW)
  @HttpCode(200)
  @ApiOperation({ summary: "释放评审认领" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationVersionId", description: "应用版本 ID" })
  @ApiOkResponse({ description: "释放后的评审队列记录", type: ReviewQueueDto })
  @ApiProblemResponses([400, 401, 403, 404])
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_REVIEW)
  @ApiOperation({ summary: "评审队列详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationVersionId", description: "应用版本 ID" })
  @ApiOkResponse({
    description: "评审队列记录（含 SLA 状态）",
    type: ReviewQueueDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async getReviewQueue(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Param("applicationVersionId") versionId: string,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.call(() => this.applications.getReviewQueue(versionId, actor));
  }

  @Post(":applicationId/publish")
  @RequiresPermissions(PERMISSIONS.APPLICATION_PUBLISH)
  @HttpCode(200)
  @ApiOperation({ summary: "发布应用" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: PublishRequestDto })
  @ApiOkResponse({ description: "发布后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async publish(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: PublishRequestDto,
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_PUBLISH)
  @HttpCode(200)
  @ApiOperation({ summary: "撤回应用" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: WithdrawRequestDto })
  @ApiOkResponse({ description: "撤回后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async withdraw(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: WithdrawRequestDto,
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_PUBLISH)
  @HttpCode(200)
  @ApiOperation({ summary: "回滚应用版本" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: RollbackRequestDto })
  @ApiOkResponse({ description: "回滚后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async rollback(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: RollbackRequestDto,
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
  @RequiresPermissions(PERMISSIONS.APPLICATION_PUBLISH)
  @HttpCode(200)
  @ApiOperation({ summary: "归档应用" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "归档后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
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

  @Delete(":applicationId")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(204)
  @ApiOperation({
    summary: "删除草稿应用",
    description:
      "仅负责人可删除 status=draft 的应用；级联清理子表数据并写入审计与 outbox 事件。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiProblemResponses([400, 401, 403, 404])
  async deleteDraft(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.call(async () =>
      this.applications.deleteApplication(
        await this.requireActor(employeeId, sessionId, "update"),
        applicationId,
      ),
    );
  }

  @Post(":applicationId/transfer")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @HttpCode(200)
  @ApiOperation({
    summary: "移交责任人",
    description:
      "负责人本人或应用管理员可将应用移交给在职员工，写入审计与 outbox 事件。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: TransferOwnerRequestDto })
  @ApiOkResponse({ description: "移交后的应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async transferOwner(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: TransferOwnerRequestDto,
  ) {
    return this.call(async () =>
      this.applications.transferOwner(
        await this.requireActor(employeeId, sessionId, "update"),
        applicationId,
        body.ownerEmployeeId,
      ),
    );
  }

  @Get("admin-list")
  @RequiresPermissions({
    anyOf: [
      PERMISSIONS.APPLICATION_READ,
      PERMISSIONS.APPLICATION_MANAGE,
      PERMISSIONS.APPLICATION_REVIEW,
    ],
  })
  @ApiOperation({ summary: "应用管理列表" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "应用管理分页结果",
    type: ApplicationAdminListResultDto,
  })
  @ApiProblemResponses([400, 401, 403])
  async listAdmin(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query("keyword") keyword?: string,
    @Query("mode") mode?: "all" | "review" | "owned",
    @Query("status")
    status?: import("./application.types.js").ApplicationStatus,
    @Query("departmentId") departmentId?: string,
    @Query("applicationType") applicationType?: string,
    @Query("channel")
    channel?: import("./application.types.js").DeliveryChannel,
    @Query("sort") sort?: "recent" | "name" | "status",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    const parsedPage = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
    const parsedPageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(pageSize ?? "10", 10) || 10),
    );
    return this.call(() =>
      this.applications.listAdmin(actor, {
        ...(keyword === undefined ? {} : { keyword }),
        ...(mode === undefined ? {} : { mode }),
        ...(status === undefined ? {} : { status }),
        ...(departmentId === undefined ? {} : { departmentId }),
        ...(applicationType === undefined ? {} : { applicationType }),
        ...(channel === undefined ? {} : { channel }),
        ...(sort === undefined ? {} : { sort }),
        page: parsedPage,
        pageSize: parsedPageSize,
      }),
    );
  }

  @Get("admin-kpis")
  @RequiresPermissions({
    anyOf: [
      PERMISSIONS.APPLICATION_READ,
      PERMISSIONS.APPLICATION_MANAGE,
      PERMISSIONS.APPLICATION_REVIEW,
    ],
  })
  @ApiOperation({ summary: "应用管理 KPI" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "应用管理 KPI", type: ApplicationAdminKpisDto })
  @ApiProblemResponses([400, 401, 403])
  async getAdminKpis(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.call(() => this.applications.getAdminKpis(actor));
  }

  @Get(":applicationId")
  @RequiresPermissions(PERMISSIONS.APPLICATION_READ)
  @ApiOperation({ summary: "应用详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "应用记录", type: ApplicationDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getApplication(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.call(() =>
      this.applications.getApplication(applicationId, actor),
    );
  }

  @Get(":applicationId/workspace")
  @RequiresPermissions(PERMISSIONS.APPLICATION_READ)
  @ApiOperation({ summary: "应用管理工作台聚合数据" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({
    description: "应用详情、版本、评审与交付聚合数据",
    type: ApplicationWorkspaceDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async getWorkspace(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.call(() =>
      this.applications.getWorkspace(applicationId, actor),
    );
  }

  @Get(":applicationId/versions")
  @RequiresPermissions(PERMISSIONS.APPLICATION_READ)
  @ApiOperation({ summary: "应用版本列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({
    description: "版本列表",
    type: ApplicationVersionDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async listVersions(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.applications.listVersions(applicationId, actor);
  }

  @Get(":applicationId/deliveries")
  @RequiresPermissions(PERMISSIONS.APPLICATION_READ)
  @ApiOperation({ summary: "交付渠道列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({
    description: "交付记录列表",
    type: DeliveryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async listDeliveries(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.applications.listDeliveries(applicationId, actor);
  }

  @Get(":applicationId/reviews")
  @RequiresPermissions(PERMISSIONS.APPLICATION_READ)
  @ApiOperation({ summary: "评审记录列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({
    description: "评审记录列表",
    type: ReviewDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async listReviews(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.applications.listReviews(applicationId, actor);
  }

  @Get(":applicationId/published-version")
  @RequiresPermissions(PERMISSIONS.APPLICATION_READ)
  @ApiOperation({ summary: "当前发布版本" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({
    description: "当前发布版本记录",
    type: ApplicationVersionDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async getPublishedVersion(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId, "read");
    return this.call(() =>
      this.applications.getPublishedVersion(applicationId, actor),
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
    if (error instanceof DraftValidationError) {
      throw new BadRequestException({
        code: "DRAFT_VALIDATION_FAILED",
        detail: "草稿未通过提交校验",
        issues: error.issues,
      });
    }
    const code =
      error instanceof Error ? error.message : "APPLICATION_REQUEST_FAILED";
    if (code.endsWith("_NOT_FOUND")) throw new NotFoundException(code);
    if (code === "NOT_AUTHORIZED" || code === "SELF_REVIEW_FORBIDDEN")
      throw new ForbiddenException(code);
    throw new BadRequestException(code);
  }
}
