import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
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
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { AnalyticsDashboardService } from "./dashboard.service.js";
import type { DashboardKey } from "./dashboard.types.js";
import { AnalyticsExportService } from "./export.service.js";
import { AnalyticsAssistantService } from "./assistant.service.js";
import {
  AnalyticsAssistantRequestDto,
  AnalyticsAssistantResultDto,
  AnalyticsDownloadResultDto,
  AnalyticsExportRequestDto,
  AnalyticsExportResultDto,
  DashboardQueryDto,
  DashboardResultDto,
} from "./analytics.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";
import {
  ANALYTICS_DASHBOARD_SERVICE,
  ANALYTICS_EXPORT_SERVICE,
  ANALYTICS_ASSISTANT_SERVICE,
} from "./analytics.tokens.js";

@ApiTags("分析")
@Controller("/internal/analytics")
@Authenticated()
export class AnalyticsController {
  constructor(
    @Inject(ANALYTICS_DASHBOARD_SERVICE)
    private readonly dashboards: AnalyticsDashboardService,
    @Inject(ANALYTICS_EXPORT_SERVICE)
    private readonly exports: AnalyticsExportService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ANALYTICS_ASSISTANT_SERVICE)
    private readonly assistant: AnalyticsAssistantService,
  ) {}

  @Get("dashboards/:dashboardKey")
  @RequiresPermissions({
    anyOf: [
      PERMISSIONS.ANALYTICS_PLATFORM_READ,
      PERMISSIONS.ANALYTICS_MARKET_READ,
      PERMISSIONS.ANALYTICS_APPLICATION_READ,
      PERMISSIONS.ANALYTICS_INNOVATION_READ,
      PERMISSIONS.ANALYTICS_REVIEW_READ,
      PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
      PERMISSIONS.ANALYTICS_RISK_READ,
      PERMISSIONS.ANALYTICS_RUNTIME_READ,
      PERMISSIONS.ANALYTICS_INTEGRATION_READ,
    ],
  })
  @ApiOperation({
    summary: "分析看板",
    description: "读取指定看板在时间范围内的日聚合指标。",
  })
  @ApiIdentityHeaders()
  @ApiParam({
    name: "dashboardKey",
    description: "看板键",
    enum: [
      "platform",
      "market",
      "application",
      "innovation",
      "review",
      "department",
      "risk",
      "runtime",
      "integration",
    ],
  })
  @ApiQuery({
    name: "from",
    description: "起始日期（YYYY-MM-DD）",
    required: false,
    example: "",
  })
  @ApiQuery({
    name: "to",
    description: "结束日期（YYYY-MM-DD）",
    required: false,
    example: "",
  })
  @ApiOkResponse({ description: "看板结果", type: DashboardResultDto })
  @ApiProblemResponses([400, 401, 403])
  async dashboard(
    @Param("dashboardKey") dashboardKey: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query() query: DashboardQueryDto,
  ) {
    return this.call(async () => {
      const actor = await this.requireActor(employeeId, sessionId);
      if (
        !this.dashboards
          .listFixedDashboards()
          .includes(dashboardKey as DashboardKey)
      ) {
        throw new Error("ANALYTICS_DASHBOARD_INVALID");
      }
      return this.dashboards.read(
        actor,
        dashboardKey as DashboardKey,
        query.from,
        query.to,
      );
    });
  }

  @Post("exports")
  @RequiresPermissions({
    allOf: [PERMISSIONS.ANALYTICS_EXPORT],
    anyOf: [
      PERMISSIONS.ANALYTICS_PLATFORM_READ,
      PERMISSIONS.ANALYTICS_MARKET_READ,
      PERMISSIONS.ANALYTICS_APPLICATION_READ,
      PERMISSIONS.ANALYTICS_INNOVATION_READ,
      PERMISSIONS.ANALYTICS_REVIEW_READ,
      PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
      PERMISSIONS.ANALYTICS_RISK_READ,
      PERMISSIONS.ANALYTICS_RUNTIME_READ,
      PERMISSIONS.ANALYTICS_INTEGRATION_READ,
    ],
  })
  @ApiOperation({ summary: "创建分析导出" })
  @ApiIdentityHeaders()
  @ApiBody({ type: AnalyticsExportRequestDto })
  @ApiCreatedResponse({
    description: "导出结果",
    type: AnalyticsExportResultDto,
  })
  @ApiProblemResponses([400, 401, 403])
  async export(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() request: AnalyticsExportRequestDto,
  ) {
    return this.call(async () =>
      this.exports.run(await this.requireActor(employeeId, sessionId), request),
    );
  }

  @Post("exports/:exportId/download")
  @RequiresPermissions(PERMISSIONS.ANALYTICS_EXPORT)
  @ApiOperation({ summary: "标记导出已下载" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "exportId", description: "导出任务 ID" })
  @ApiCreatedResponse({
    description: "下载结果",
    type: AnalyticsDownloadResultDto,
  })
  @ApiProblemResponses([400, 401, 403])
  async download(
    @Param("exportId") exportId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () => {
      await this.exports.markDownloaded(
        await this.requireActor(employeeId, sessionId),
        exportId,
      );
      return { downloaded: true, exportId };
    });
  }

  @Post("assistant")
  @RequiresPermissions(PERMISSIONS.ANALYTICS_ASSISTANT_USE)
  @ApiOperation({ summary: "分析助手问答" })
  @ApiIdentityHeaders()
  @ApiBody({ type: AnalyticsAssistantRequestDto })
  @ApiCreatedResponse({
    description: "助手回答",
    type: AnalyticsAssistantResultDto,
  })
  @ApiProblemResponses([400, 401, 403])
  async assistantRequest(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() request: AnalyticsAssistantRequestDto,
  ) {
    return this.call(async () =>
      this.assistant.ask(
        await this.requireActor(employeeId, sessionId),
        request,
      ),
    );
  }

  private async requireActor(
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
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      const code =
        error instanceof Error ? error.message : "ANALYTICS_REQUEST_FAILED";
      if (
        code === "ANALYTICS_DASHBOARD_FORBIDDEN" ||
        code === "ANALYTICS_EXPORT_FORBIDDEN"
      ) {
        throw new ForbiddenException(code);
      }
      throw new BadRequestException(code);
    }
  }
}
