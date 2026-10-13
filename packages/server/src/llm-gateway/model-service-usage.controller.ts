import { Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  CurrentActor,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";
import { toControlPlaneHttpException } from "./model-service-error.mapper.js";
import {
  LLM_GATEWAY_SERVICE,
  LLM_USAGE_SERVICE,
} from "./llm-gateway.tokens.js";
import { ModelServiceKeyService } from "./model-service-key.service.js";
import {
  ModelServiceUsageService,
  type CallPage,
} from "./model-service-usage.service.js";
import {
  AdminCallListQueryDto,
  AdminKeyListQueryDto,
  AdminUsageQueryDto,
  CallListQueryDto,
  CallPageDto,
  UsageSummaryDto,
  UsageSummaryQueryDto,
} from "./model-service-usage.dto.js";
import type { AdminKeyPage } from "./model-service-key.service.js";

/**
 * 模型服务用量与管理面控制器（PRD 8.1 用量视图 / FR-15 / FR-16）。
 *
 * 一个控制器同时承载「本人视角」与「管理面视角」，是因为二者的**数据形状完全一致**，
 * 差别只在数据权限：本人视角把 `employeeId` 锁成 actor 自己，管理面可由 `employeeId`
 * 指定、不传即全平台。把它们拆成两个控制器只会让两套 DTO 与两套映射各自漂移。
 *
 * 权限码分工：
 * - 本人用量：`model_service.usage.read`
 * - 全平台用量：`model_service.usage.read_all`
 * - 全平台 Key 管理（列表与代禁用/启用）：`model_service.key.manage_all`
 *
 * **越权口径**：管理面接口缺少 `*_all` 权限时由 `@RequiresPermissions` 直接 403，
 * 不走「查不到就 404」的本人视角口径——管理入口本身就不该对普通员工存在。
 */
@ApiTags("模型服务")
@Controller("/internal/model-service")
@Authenticated()
export class ModelServiceUsageController {
  public constructor(
    @Inject(LLM_USAGE_SERVICE)
    private readonly usage: ModelServiceUsageService,
    @Inject(LLM_GATEWAY_SERVICE)
    private readonly keys: ModelServiceKeyService,
  ) {}

  @Get("/usage")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_USAGE_READ)
  @ApiOperation({ summary: "本人用量汇总（今日/7 日/30 日 + 日趋势与构成）" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: UsageSummaryDto, description: "用量汇总" })
  @ApiProblemResponses([400, 401, 403])
  public async getMyUsage(
    @CurrentActor() actor: ActorContext,
    @Query() query: UsageSummaryQueryDto,
  ): Promise<UsageSummaryDto> {
    try {
      return await this.usage.getSummary(
        { employeeId: actor.employeeId },
        query,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get("/calls")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_USAGE_READ)
  @ApiOperation({ summary: "本人调用明细（分页，可按 Key/模型/仅失败筛选）" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: CallPageDto, description: "调用明细分页" })
  @ApiProblemResponses([400, 401, 403])
  public async listMyCalls(
    @CurrentActor() actor: ActorContext,
    @Query() query: CallListQueryDto,
  ): Promise<CallPageDto> {
    try {
      const page = await this.usage.listCalls(
        { employeeId: actor.employeeId },
        toListCallsQuery(query),
      );
      return toCallPageDto(page);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get("/admin/usage")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_USAGE_READ_ALL)
  @ApiOperation({ summary: "全平台用量汇总（可指定员工，不传即全平台）" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: UsageSummaryDto, description: "用量汇总" })
  @ApiProblemResponses([400, 401, 403])
  public async getPlatformUsage(
    @Query() query: AdminUsageQueryDto,
  ): Promise<UsageSummaryDto> {
    try {
      return await this.usage.getSummary(
        { employeeId: query.employeeId ?? null },
        query,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get("/admin/calls")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_USAGE_READ_ALL)
  @ApiOperation({ summary: "全平台调用明细（可指定员工）" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: CallPageDto, description: "调用明细分页" })
  @ApiProblemResponses([400, 401, 403])
  public async listPlatformCalls(
    @Query() query: AdminCallListQueryDto,
  ): Promise<CallPageDto> {
    try {
      const page = await this.usage.listCalls(
        { employeeId: query.employeeId ?? null },
        toListCallsQuery(query),
      );
      return toCallPageDto(page);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get("/admin/keys")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE_ALL)
  @ApiOperation({ summary: "全平台 Key 列表（含归属人；不返回明文）" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "Key 列表" })
  @ApiProblemResponses([400, 401, 403])
  public async listKeysAsAdmin(
    @CurrentActor() actor: ActorContext,
    @Query() query: AdminKeyListQueryDto,
  ): Promise<AdminKeyPage> {
    try {
      return await this.keys.listKeysAsAdmin(actor, query);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post("/admin/keys/:keyId/disable")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE_ALL)
  @ApiOperation({ summary: "代员工禁用 Key（幂等；写审计含归属人）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiOkResponse({ description: "禁用后的 Key" })
  @ApiProblemResponses([401, 403, 404, 409])
  public async disableKeyAsAdmin(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
  ): Promise<unknown> {
    try {
      return await this.keys.disableKeyAsAdmin(actor, keyId);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post("/admin/keys/:keyId/enable")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE_ALL)
  @ApiOperation({ summary: "代员工启用 Key（幂等；revoked 返回 409）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiOkResponse({ description: "启用后的 Key" })
  @ApiProblemResponses([401, 403, 404, 409])
  public async enableKeyAsAdmin(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
  ): Promise<unknown> {
    try {
      return await this.keys.enableKeyAsAdmin(actor, keyId);
    } catch (error) {
      this.mapError(error);
    }
  }

  private mapError(error: unknown): never {
    return toControlPlaneHttpException(error);
  }
}

/** DTO → 服务入参：只挑服务认识的字段，并把查询串布尔转成真布尔（避免字符串漏进服务层）。 */
function toListCallsQuery(
  query: CallListQueryDto | AdminCallListQueryDto,
): Parameters<ModelServiceUsageService["listCalls"]>[1] {
  return {
    ...(query.range === undefined ? {} : { range: query.range }),
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
    ...(query.keyId === undefined ? {} : { keyId: query.keyId }),
    ...(query.model === undefined ? {} : { model: query.model }),
    ...(query.errorOnly === undefined
      ? {}
      : { errorOnly: query.errorOnly === "true" }),
    ...(query.page === undefined ? {} : { page: query.page }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
  };
}

/** 时间字段统一序列化为 ISO 字符串（与平台其余控制面口径一致）。 */
function toCallPageDto(page: CallPage): CallPageDto {
  return {
    items: page.items.map((item) => ({
      ...item,
      requestedAt: item.requestedAt.toISOString(),
    })),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
  };
}
