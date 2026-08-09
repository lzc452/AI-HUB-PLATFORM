import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Body,
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
import type { ActorContext } from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { CATALOG_SERVICE } from "./catalog.tokens.js";
import { CatalogService } from "./catalog.service.js";
import type { CatalogSearchInput } from "./catalog.types.js";
import {
  CatalogActionRequestDto,
  CatalogEntryDto,
  CatalogListResultDto,
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
    enum: ["recommended", "latest", "popular"],
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
    @Query("query") query?: string,
    @Query("categoryId") categoryId?: string,
    @Query("applicationType") applicationType?: string,
    @Query("sort") sort?: "recommended" | "latest" | "popular",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const input: CatalogSearchInput = {
      actor: await this.requireActor(employeeId, sessionId),
      sort: sort ?? "recommended",
      page: this.parsePositive(page, 1),
      pageSize: this.parsePositive(pageSize, 20),
      ...(query === undefined ? {} : { query }),
      ...(categoryId === undefined ? {} : { categoryId }),
      ...(applicationType === undefined ? {} : { applicationType }),
    };
    return this.call(() => this.catalog.list(input));
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

  private async requireActor(
    employeeId: string | undefined,
    sessionId: string | undefined,
  ): Promise<ActorContext> {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    const actor = await this.identity.getActorContext(employeeId, sessionId);
    const decision = await this.identity.authorize({
      actor,
      action: "read",
      resourceType: "catalog",
    });
    if (!decision.allowed) throw new ForbiddenException("NOT_AUTHORIZED");
    return actor;
  }

  private parsePositive(value: string | undefined, fallback: number): number {
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
      if (code === "NOT_AUTHORIZED") throw new ForbiddenException(code);
      throw new BadRequestException(code);
    }
  }
}
