import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import {
  HealthModule,
  ApplicationModule,
  IdentityModule,
  ObservabilityMetrics,
  ObservabilityModule,
  type DatabaseHealthCheck,
  type ObservabilityModuleOptions,
  type IdentityService,
  type ApplicationService,
  type ArtifactVerificationPort,
} from "@ai-hub/server";

export interface ApiModuleTestOptions {
  databaseCheck: DatabaseHealthCheck;
  identity?: IdentityService;
  application?: ApplicationService;
  artifactVerification?: ArtifactVerificationPort;
  observability?: ObservabilityModuleOptions;
}

const createProductionDatabaseCheck = (
  databaseUrl: string,
  metrics: ObservabilityMetrics,
): DatabaseHealthCheck => {
  return async () => {
    const db = createDatabase(databaseUrl);

    try {
      await db.selectFrom("outbox_events").select("id").limit(1).execute();
      metrics.recordDatabaseReadiness(true);
      return true;
    } catch {
      metrics.recordDatabaseReadiness(false);
      return false;
    } finally {
      await db.destroy();
    }
  };
};

@Module({})
export class ApiModule {
  static register(
    databaseUrl: string,
    observability: ObservabilityModuleOptions = {},
    artifactVerification?: ArtifactVerificationPort,
  ): DynamicModule {
    const metrics = observability.metrics ?? new ObservabilityMetrics();
    return {
      module: ApiModule,
      imports: [
        ObservabilityModule.register({ ...observability, metrics }),
        IdentityModule.register(databaseUrl),
        ApplicationModule.register(databaseUrl, artifactVerification),
        HealthModule.register(
          createProductionDatabaseCheck(databaseUrl, metrics),
        ),
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
        HealthModule.register(databaseCheck),
      ],
    };
  }
}
