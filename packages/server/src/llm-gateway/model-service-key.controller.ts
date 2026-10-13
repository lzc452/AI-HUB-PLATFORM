import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
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
  CreateApiKeyRequestDto,
  CreateApiKeyResponseDto,
  ApiKeyPageDto,
  ApiKeySummaryDto,
  ListApiKeysQueryDto,
  UpdateApiKeyRequestDto,
} from "./llm-gateway.dto.js";
import { LLM_GATEWAY_SERVICE } from "./llm-gateway.tokens.js";
import { ModelServiceKeyService } from "./model-service-key.service.js";

/**
 * 模型服务控制面（PRD 8.1）：Key 生命周期 + 用量入口占位。
 *
 * 路由前缀与平台既有控制面一致（`/internal/*`），因此自动获得 Cookie 会话鉴权、
 * ProblemDetails 错误信封与访问日志；网关面（`/v1`）是另一套鉴权（Bearer API Key），
 * 不在此控制器内。
 *
 * 数据权限一律为「本人」：服务层强制 `employee_id = actor`，越权查询表现为 404。
 * 全平台管理面（`/admin/*`）留待 M4 随管理视图一并实现。
 */
@ApiTags("模型服务")
@Controller("/internal/model-service")
@Authenticated()
export class ModelServiceKeyController {
  public constructor(
    @Inject(LLM_GATEWAY_SERVICE)
    private readonly keys: ModelServiceKeyService,
  ) {}

  @Post("/keys")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE)
  @ApiOperation({ summary: "创建 API Key（明文仅本次返回）" })
  @ApiIdentityHeaders()
  @ApiCreatedResponse({
    type: CreateApiKeyResponseDto,
    description: "创建成功",
  })
  @ApiProblemResponses([400, 401, 403, 409, 503])
  public async createKey(
    @CurrentActor() actor: ActorContext,
    @Body() body: CreateApiKeyRequestDto,
  ): Promise<CreateApiKeyResponseDto> {
    try {
      const result = await this.keys.createKey(actor, body);
      return { ...result.summary, apiKey: result.apiKey };
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get("/keys")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_READ)
  @ApiOperation({ summary: "本人 API Key 列表（不含明文）" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: ApiKeyPageDto, description: "列表" })
  @ApiProblemResponses([400, 401, 403])
  public async listKeys(
    @CurrentActor() actor: ActorContext,
    @Query() query: ListApiKeysQueryDto,
  ): Promise<ApiKeyPageDto> {
    try {
      return await this.keys.listKeys(actor, {
        ...(query.includeRevoked === undefined
          ? {}
          : { includeRevoked: query.includeRevoked === "true" }),
        ...(query.page === undefined ? {} : { page: query.page }),
        ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get("/keys/:keyId")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_READ)
  @ApiOperation({ summary: "本人 API Key 详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiOkResponse({ type: ApiKeySummaryDto, description: "详情" })
  @ApiProblemResponses([401, 403, 404])
  public async getKey(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
  ): Promise<ApiKeySummaryDto> {
    try {
      return await this.keys.getKey(actor, keyId);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Patch("/keys/:keyId")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE)
  @ApiOperation({ summary: "变更 Key 属性（名称/限额/有效期）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiOkResponse({ type: ApiKeySummaryDto, description: "变更后的 Key" })
  @ApiProblemResponses([400, 401, 403, 404, 409])
  public async updateKey(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
    @Body() body: UpdateApiKeyRequestDto,
  ): Promise<ApiKeySummaryDto> {
    try {
      return await this.keys.updateKey(actor, keyId, body);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post("/keys/:keyId/disable")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE)
  @ApiOperation({ summary: "禁用 Key（幂等）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiOkResponse({ type: ApiKeySummaryDto, description: "禁用后的 Key" })
  @ApiProblemResponses([401, 403, 404, 409])
  public async disableKey(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
  ): Promise<ApiKeySummaryDto> {
    try {
      return await this.keys.disableKey(actor, keyId);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post("/keys/:keyId/enable")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE)
  @ApiOperation({ summary: "启用 Key（幂等；revoked 返回 409）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiOkResponse({ type: ApiKeySummaryDto, description: "启用后的 Key" })
  @ApiProblemResponses([401, 403, 404, 409])
  public async enableKey(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
  ): Promise<ApiKeySummaryDto> {
    try {
      return await this.keys.enableKey(actor, keyId);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post("/keys/:keyId/rotate")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE)
  @ApiOperation({ summary: "轮换 Key（旧钥同事务撤销，无宽限期）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiCreatedResponse({ type: CreateApiKeyResponseDto, description: "新 Key" })
  @ApiProblemResponses([401, 403, 404, 409, 503])
  public async rotateKey(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
  ): Promise<CreateApiKeyResponseDto> {
    try {
      const result = await this.keys.rotateKey(actor, keyId);
      return { ...result.summary, apiKey: result.apiKey };
    } catch (error) {
      this.mapError(error);
    }
  }

  @Delete("/keys/:keyId")
  @RequiresPermissions(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "删除 Key（软删为 revoked，幂等）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "keyId", description: "Key ID" })
  @ApiNoContentResponse({ description: "已撤销" })
  @ApiProblemResponses([401, 403, 404, 409])
  public async revokeKey(
    @CurrentActor() actor: ActorContext,
    @Param("keyId") keyId: string,
  ): Promise<void> {
    try {
      await this.keys.revokeKey(actor, keyId);
    } catch (error) {
      this.mapError(error);
    }
  }

  /** 领域错误 → HTTP 语义（共享映射器，避免与用量控制器各写一份）。 */
  private mapError(error: unknown): never {
    return toControlPlaneHttpException(error);
  }
}
