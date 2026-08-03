import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { AnalyticsController } from "./analytics.controller.js";
import {
  ANALYTICS_DASHBOARD_SERVICE,
  ANALYTICS_EXPORT_SERVICE,
} from "./analytics.tokens.js";
import { KyselyAnalyticsDashboardRepository } from "./dashboard.repository.js";
import { AnalyticsDashboardService } from "./dashboard.service.js";
import { KyselyAnalyticsExportRepository } from "./export.repository.js";
import { AnalyticsExportService } from "./export.service.js";
import { AnalyticsAssistantService } from "./assistant.service.js";
import { KyselyAssistantAuditRepository } from "./assistant.repository.js";
import { UnavailableDifyAssistantPort } from "./dify.port.js";
import { ANALYTICS_ASSISTANT_SERVICE } from "./analytics.tokens.js";

@Module({})
export class AnalyticsModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: AnalyticsModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [AnalyticsController],
      providers: [
        {
          provide: ANALYTICS_DASHBOARD_SERVICE,
          useFactory: () =>
            new AnalyticsDashboardService(
              new KyselyAnalyticsDashboardRepository(
                createDatabase(databaseUrl),
              ),
            ),
        },
        {
          provide: ANALYTICS_EXPORT_SERVICE,
          useFactory: () =>
            new AnalyticsExportService(
              new KyselyAnalyticsExportRepository(createDatabase(databaseUrl)),
            ),
        },
        {
          provide: ANALYTICS_ASSISTANT_SERVICE,
          useFactory: () =>
            new AnalyticsAssistantService(
              new KyselyAssistantAuditRepository(createDatabase(databaseUrl)),
              new UnavailableDifyAssistantPort(),
            ),
        },
      ],
      exports: [
        ANALYTICS_DASHBOARD_SERVICE,
        ANALYTICS_EXPORT_SERVICE,
        ANALYTICS_ASSISTANT_SERVICE,
      ],
    };
  }

  static forTest(
    dashboard: AnalyticsDashboardService,
    exportService: AnalyticsExportService,
    identity: IdentityService,
    assistant?: AnalyticsAssistantService,
  ): DynamicModule {
    return {
      module: AnalyticsModule,
      controllers: [AnalyticsController],
      providers: [
        { provide: ANALYTICS_DASHBOARD_SERVICE, useValue: dashboard },
        { provide: ANALYTICS_EXPORT_SERVICE, useValue: exportService },
        {
          provide: ANALYTICS_ASSISTANT_SERVICE,
          useValue:
            assistant ??
            new AnalyticsAssistantService(
              {
                reviewAuthorization: async () => ({
                  allowed: false,
                  reason: "DENY_TEST_DEFAULT",
                }),
                recordAudit: async () => undefined,
              },
              new UnavailableDifyAssistantPort(),
            ),
        },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [
        ANALYTICS_DASHBOARD_SERVICE,
        ANALYTICS_EXPORT_SERVICE,
        ANALYTICS_ASSISTANT_SERVICE,
      ],
    };
  }
}
