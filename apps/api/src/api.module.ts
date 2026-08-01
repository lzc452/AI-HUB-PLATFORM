import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import {
  HealthModule,
  ObservabilityMetrics,
  ObservabilityModule,
  type DatabaseHealthCheck,
  type ObservabilityModuleOptions,
} from "@ai-hub/server";

export interface ApiModuleTestOptions {
  databaseCheck: DatabaseHealthCheck;
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
  ): DynamicModule {
    const metrics = observability.metrics ?? new ObservabilityMetrics();
    return {
      module: ApiModule,
      imports: [
        ObservabilityModule.register({ ...observability, metrics }),
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
        HealthModule.register(databaseCheck),
      ],
    };
  }
}
