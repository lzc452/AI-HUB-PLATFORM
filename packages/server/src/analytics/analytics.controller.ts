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
import type { ActorContext } from "@ai-hub/contracts";
import { IdentityService } from "../identity/identity.service.js";
import { AnalyticsDashboardService } from "./dashboard.service.js";
import type { DashboardKey } from "./dashboard.types.js";
import { AnalyticsExportService } from "./export.service.js";
import { AnalyticsAssistantService } from "./assistant.service.js";
import type { AssistantRequest } from "./assistant.types.js";
import type { AnalyticsExportRequest } from "./export.types.js";
import {
  ANALYTICS_DASHBOARD_SERVICE,
  ANALYTICS_EXPORT_SERVICE,
  ANALYTICS_ASSISTANT_SERVICE,
} from "./analytics.tokens.js";

@Controller("/internal/analytics")
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
  async dashboard(
    @Param("dashboardKey") dashboardKey: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query("from") from = "",
    @Query("to") to = "",
  ) {
    return this.call(async () => {
      const actor = await this.requireActor(employeeId, sessionId);
      if (!this.dashboards.listFixedDashboards().includes(dashboardKey as DashboardKey)) {
        throw new Error("ANALYTICS_DASHBOARD_INVALID");
      }
      return this.dashboards.read(actor, dashboardKey as DashboardKey, from, to);
    });
  }

  @Post("exports")
  async export(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() request: AnalyticsExportRequest,
  ) {
    return this.call(async () =>
      this.exports.run(await this.requireActor(employeeId, sessionId), request),
    );
  }

  @Post("exports/:exportId/download")
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
  async assistantRequest(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() request: AssistantRequest,
  ) {
    return this.call(async () =>
      this.assistant.ask(await this.requireActor(employeeId, sessionId), request),
    );
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
      resourceType: "analytics",
    });
    if (!decision.allowed) throw new ForbiddenException("NOT_AUTHORIZED");
    return actor;
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      const code = error instanceof Error ? error.message : "ANALYTICS_REQUEST_FAILED";
      if (code === "ANALYTICS_DASHBOARD_FORBIDDEN" || code === "ANALYTICS_EXPORT_FORBIDDEN") {
        throw new ForbiddenException(code);
      }
      throw new BadRequestException(code);
    }
  }
}
