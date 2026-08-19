import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { Readable } from "node:stream";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { ActorContext } from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { APPLICATION_SERVICE } from "../application/application.tokens.js";
import { ApplicationService } from "../application/application.service.js";
import { ApplicationVersionDto } from "../application/application.dto.js";
import { ARTIFACT_STORAGE } from "../application/application.tokens.js";
import type { ReadableObjectStoragePort } from "../application/storage.port.js";
import { CATALOG_SERVICE } from "./catalog.tokens.js";
import { CatalogService } from "./catalog.service.js";
import type { CatalogSearchInput } from "./catalog.types.js";
import {
  CatalogActionRequestDto,
  CatalogEntryDto,
  CatalogListResultDto,
  CategorySummaryDto,
  ListCatalogQueryDto,
  RiskDescriptionDto,
  SaveRiskDescriptionRequestDto,
  TagSummaryDto,
} from "./catalog.dto.js";
import { RecordActionResultDto } from "../system/http/simple-results.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("市场目录")
@Controller("/internal/catalog")
@Authenticated()
export class CatalogController {
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalog: CatalogService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Optional()
    @Inject(APPLICATION_SERVICE)
    private readonly applications: ApplicationService | undefined,
    @Optional()
    @Inject(ARTIFACT_STORAGE)
    private readonly storage: ReadableObjectStoragePort | undefined,
  ) {}

  @Get()
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({
    summary: "目录列表",
    description: "按条件搜索已发布应用目录。",
  })
  @ApiIdentityHeaders()
  @ApiQuery({ name: "query", description: "搜索关键词", required: false })
  @ApiQuery({ name: "categoryId", description: "分类 ID", required: false })
  @ApiQuery({
    name: "applicationType",
    description: "应用类型",
    required: false,
  })
  @ApiQuery({
    name: "sort",
    description: "排序方式",
    required: false,
    enum: ["recommended", "latest", "popular", "rating"],
  })
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
  @ApiOkResponse({ description: "目录列表结果", type: CatalogListResultDto })
  @ApiProblemResponses([400, 401, 403])
  async list(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query() query: ListCatalogQueryDto,
  ) {
    const input: CatalogSearchInput = {
      actor: await this.requireActor(employeeId, sessionId),
      sort: query.sort ?? "recommended",
      page: this.parsePositive(query.page, 1),
      pageSize: this.parsePositive(query.pageSize, 20),
      ...(query.query === undefined ? {} : { query: query.query }),
      ...(query.categoryId === undefined
        ? {}
        : { categoryId: query.categoryId }),
      ...(query.applicationType === undefined
        ? {}
        : { applicationType: query.applicationType }),
    };
    return this.call(() => this.catalog.list(input));
  }

  @Get("categories")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: "分类列表", description: "返回启用的单层主分类。" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "分类列表",
    type: CategorySummaryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listCategories() {
    return this.call(() => this.catalog.listCategories());
  }

  @Get("tags")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: "标签列表", description: "返回启用的标签。" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "标签列表",
    type: TagSummaryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listTags() {
    return this.call(() => this.catalog.listTags());
  }

  @Get(":applicationId")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: "目录条目详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "目录条目详情", type: CatalogEntryDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async detail(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.catalog.getDetail(
        await this.requireActor(employeeId, sessionId),
        applicationId,
      ),
    );
  }

  @Post(":applicationId/actions")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({
    summary: "记录目录行为",
    description: "记录网页跳转、包下载或二维码展示等行为。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: CatalogActionRequestDto })
  @ApiCreatedResponse({ description: "记录完成", type: RecordActionResultDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async recordAction(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: CatalogActionRequestDto,
  ) {
    return this.call(async () => {
      await this.catalog.recordDeliveryAction(
        await this.requireActor(employeeId, sessionId),
        { applicationId, ...body },
      );
      return { recorded: true };
    });
  }

  @Post(":applicationId/deliveries/:channel/resolve")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({
    summary: "解析交付渠道",
    description:
      "受众校验后返回 Web 跳转地址、短期下载 URL 或二维码 payload，并记录行为。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({
    name: "channel",
    description: "交付渠道",
    enum: ["web", "desktop", "mobile", "mini_program"],
  })
  @ApiOkResponse({
    description: "交付解析结果（kind: web_redirect/download/qr/unavailable）",
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async resolveDelivery(
    @Param("applicationId") applicationId: string,
    @Param("channel")
    channel: "web" | "desktop" | "mobile" | "mini_program",
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.catalog.resolveDelivery(
        await this.requireActor(employeeId, sessionId),
        applicationId,
        channel,
      ),
    );
  }

  @Get("deliveries/:deliveryId/qr")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({
    summary: "小程序二维码图片（流式）",
    description:
      "按交付 ID 返回二维码图片流（交付目标配置的 qr_code_asset_id 资产）；未配置或被删时 404。",
  })
  @ApiIdentityHeaders()
  @ApiParam({ name: "deliveryId", description: "交付 ID" })
  @ApiOkResponse({ description: "二维码图片流（image/png）" })
  @ApiProblemResponses([400, 401, 403, 404])
  async getDeliveryQrAsset(
    @Param("deliveryId") deliveryId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId);
    const asset = await this.call(() =>
      this.catalog.getQrAsset(actor, deliveryId),
    );
    if (this.storage === undefined) {
      throw new NotFoundException("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    }
    const stream = await this.storage.openReadStream(asset.storageKey);
    if (stream === null) {
      throw new NotFoundException("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    }
    return new StreamableFile(
      stream instanceof Readable
        ? stream
        : Readable.from(stream as AsyncIterable<Uint8Array>),
      { type: asset.mimeType || "image/png" },
    );
  }

  @Get(":applicationId/deliveries/:channel/asset")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: "下载交付安装包（流式）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "channel", description: "交付渠道" })
  @ApiOkResponse({ description: "安装包文件流" })
  @ApiProblemResponses([400, 401, 403, 404])
  async downloadAsset(
    @Param("applicationId") applicationId: string,
    @Param("channel")
    channel: "web" | "desktop" | "mobile" | "mini_program",
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    const actor = await this.requireActor(employeeId, sessionId);
    const storageKey = await this.call(() =>
      this.catalog.getDeliveryAssetStorageKey(actor, applicationId, channel),
    );
    if (this.storage === undefined) {
      throw new NotFoundException("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    }
    const stream = await this.storage.openReadStream(storageKey);
    if (stream === null) {
      throw new NotFoundException("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    }
    return new StreamableFile(
      stream instanceof Readable
        ? stream
        : Readable.from(stream as AsyncIterable<Uint8Array>),
    );
  }

  @Get(":applicationId/versions")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: "应用版本历史" })
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
    return this.call(async () => {
      await this.catalog.getDetail(
        await this.requireActor(employeeId, sessionId),
        applicationId,
      );
      if (this.applications === undefined) {
        throw new Error("APPLICATION_SERVICE_UNAVAILABLE");
      }
      return this.applications.listVersions(applicationId);
    });
  }

  @Get(":applicationId/risk")
  @RequiresPermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: "风险说明" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiOkResponse({ description: "风险说明", type: RiskDescriptionDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getRiskDescription(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.catalog.getRiskDescription(
        await this.requireActor(employeeId, sessionId),
        applicationId,
      ),
    );
  }

  @Put(":applicationId/risk")
  @RequiresPermissions(PERMISSIONS.APPLICATION_UPDATE)
  @ApiOperation({ summary: "更新风险说明" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiBody({ type: SaveRiskDescriptionRequestDto })
  @ApiOkResponse({ type: RiskDescriptionDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async saveRiskDescription(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: SaveRiskDescriptionRequestDto,
  ) {
    return this.call(async () => {
      await this.catalog.saveRiskDescription(
        await this.requireActor(employeeId, sessionId, "update", "application"),
        applicationId,
        body.riskDescription,
      );
      return this.catalog.getRiskDescription(
        await this.requireActor(employeeId, sessionId),
        applicationId,
      );
    });
  }

  private async requireActor(
    employeeId: string | undefined,
    sessionId: string | undefined,
    action: string = "read",
    resourceType: string = "catalog",
  ): Promise<ActorContext> {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    const actor = await this.identity.getActorContext(employeeId, sessionId);
    const decision = await this.identity.authorize({
      actor,
      action,
      resourceType,
    });
    if (!decision.allowed) throw new ForbiddenException("NOT_AUTHORIZED");
    return actor;
  }

  private parsePositive(
    value: string | number | undefined,
    fallback: number,
  ): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException("CATALOG_PAGINATION_INVALID");
    }
    return parsed;
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "CATALOG_REQUEST_FAILED";
      if (code === "CATALOG_APPLICATION_NOT_FOUND") {
        throw new NotFoundException(code);
      }
      if (code === "CATALOG_DELIVERY_ASSET_NOT_FOUND") {
        throw new NotFoundException(code);
      }
      if (code === "NOT_AUTHORIZED") throw new ForbiddenException(code);
      throw new BadRequestException(code);
    }
  }
}
