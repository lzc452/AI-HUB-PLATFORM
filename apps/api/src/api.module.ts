import { createDatabase } from "@ai-hub/database";
import type { DatabaseSchema } from "@ai-hub/database";
import {
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import type { Kysely } from "kysely";
import {
  HealthModule,
  ApplicationModule,
  CatalogModule,
  CatalogService,
  InteractionModule,
  InteractionService,
  FeedbackModule,
  NotificationModule,
  NotificationService,
  CreatorModule,
  CreatorService,
  DemandModule,
  DemandService,
  AnalyticsModule,
  AnalyticsDashboardService,
  AnalyticsExportService,
  AnalyticsAssistantService,
  IdentityModule,
  ObservabilityMetrics,
  ObservabilityModule,
  PermissionGuard,
  type DatabaseHealthCheck,
  type ObservabilityModuleOptions,
  type IdentityService,
  type ApplicationService,
  type ArtifactVerificationPort,
  type ReadableObjectStoragePort,
  type WebTargetPolicy,
} from "@ai-hub/server";

export interface ApiModuleTestOptions {
  databaseCheck: DatabaseHealthCheck;
  identity?: IdentityService;
  application?: ApplicationService;
  catalog?: CatalogService;
  interaction?: InteractionService;
  notification?: NotificationService;
  creator?: CreatorService;
  demand?: DemandService;
  analytics?: {
    dashboard: AnalyticsDashboardService;
    exportService: AnalyticsExportService;
    assistant?: AnalyticsAssistantService;
  };
  artifactVerification?: ArtifactVerificationPort;
  observability?: ObservabilityModuleOptions;
}

const API_DATABASE = Symbol("API_DATABASE");

class ApiDatabaseLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(API_DATABASE)
    private readonly database: Kysely<DatabaseSchema>,
  ) {}

  onApplicationShutdown(): Promise<void> {
    return this.database.destroy();
  }
}

const createProductionDatabaseCheck = (
  database: Kysely<DatabaseSchema>,
  metrics: ObservabilityMetrics,
): DatabaseHealthCheck => {
  return async () => {
    try {
      await database
        .selectFrom("outbox_events")
        .select("id")
        .limit(1)
        .execute();
      metrics.recordDatabaseReadiness(true);
      return true;
    } catch {
      metrics.recordDatabaseReadiness(false);
      return false;
    }
  };
};

@Module({})
export class ApiModule {
  static register(
    databaseOrUrl: string | Kysely<DatabaseSchema>,
    observability: ObservabilityModuleOptions = {},
    artifactVerification?: ArtifactVerificationPort,
    identityOptions?: {
      loginEncryptionPrivateKey?: string;
      dingtalkSso?: {
        clientId: string;
        clientSecret: string;
        corpId: string;
        redirectUri: string;
      };
      auditExportStorage?: ReadableObjectStoragePort;
    },
    storageDirectory?: string,
    artifactMaxSizeBytes?: number,
    artifactStorage?: ReadableObjectStoragePort,
    /**
     * 内网 Web 交付 URL 白名单（规格 §11.3）。来自
     * config.webTargetAllowlist；缺省时由 ApplicationModule 按
     * fail-closed 默认处理（拒绝一切 Web 目标）。
     */
    webTargetPolicy?: WebTargetPolicy,
  ): DynamicModule {
    const database =
      typeof databaseOrUrl === "string"
        ? createDatabase(databaseOrUrl)
        : databaseOrUrl;
    const metrics = observability.metrics ?? new ObservabilityMetrics();
    return {
      module: ApiModule,
      providers: [
        { provide: APP_GUARD, useClass: PermissionGuard },
        { provide: API_DATABASE, useValue: database },
        ApiDatabaseLifecycle,
      ],
      imports: [
        ObservabilityModule.register({ ...observability, metrics }),
        IdentityModule.register(database, {
          ...identityOptions,
          ...(artifactStorage === undefined
            ? {}
            : { auditExportStorage: artifactStorage }),
        }),
        ApplicationModule.register(
          database,
          artifactVerification,
          storageDirectory,
          artifactMaxSizeBytes,
          artifactStorage,
          webTargetPolicy,
        ),
        CatalogModule.register(database, artifactStorage),
        InteractionModule.register(database),
        FeedbackModule.register(database),
        NotificationModule.register(database),
        CreatorModule.register(database),
        DemandModule.register(database, storageDirectory),
        AnalyticsModule.register(database),
        HealthModule.register(createProductionDatabaseCheck(database, metrics)),
      ],
    };
  }

  static forTest(options: ApiModuleTestOptions): DynamicModule {
    const metrics =
      options.observability?.metrics ?? new ObservabilityMetrics();
    const databaseCheck = async () => {
      const ready = await options.databaseCheck();
      metrics.recordDatabaseReadiness(ready);
      return ready;
    };
    return {
      module: ApiModule,
      providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
      imports: [
        ObservabilityModule.register({ ...options.observability, metrics }),
        ...(options.identity === undefined
          ? []
          : [IdentityModule.forTest(options.identity)]),
        ...(options.application === undefined
          ? []
          : [
              ApplicationModule.forTest(
                options.application,
                options.identity as IdentityService,
                options.artifactVerification,
              ),
            ]),
        ...(options.catalog === undefined || options.identity === undefined
          ? []
          : [
              CatalogModule.forTest(
                options.catalog,
                options.identity,
                options.application,
              ),
            ]),
        ...(options.interaction === undefined || options.identity === undefined
          ? []
          : [InteractionModule.forTest(options.interaction, options.identity)]),
        ...(options.notification === undefined || options.identity === undefined
          ? []
          : [
              NotificationModule.forTest(
                options.notification,
                options.identity,
              ),
            ]),
        ...(options.creator === undefined || options.identity === undefined
          ? []
          : [CreatorModule.forTest(options.creator, options.identity)]),
        ...(options.demand === undefined || options.identity === undefined
          ? []
          : [
              DemandModule.forTest(
                options.demand,
                options.identity,
                options.application,
              ),
            ]),
        HealthModule.register(databaseCheck),
        ...(options.analytics === undefined || options.identity === undefined
          ? []
          : [
              AnalyticsModule.forTest(
                options.analytics.dashboard,
                options.analytics.exportService,
                options.identity,
                options.analytics.assistant,
              ),
            ]),
      ],
    };
  }
}
