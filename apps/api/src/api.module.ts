import { Module, type DynamicModule } from "@nestjs/common";
import { createDatabase } from "@ai-hub/database";
import { HealthModule, type DatabaseHealthCheck } from "@ai-hub/server";

export interface ApiModuleTestOptions {
  databaseCheck: DatabaseHealthCheck;
}

const createProductionDatabaseCheck = (
  databaseUrl: string,
): DatabaseHealthCheck => {
  return async () => {
    const db = createDatabase(databaseUrl);

    try {
      await db.selectFrom("outbox_events").select("id").limit(1).execute();
      return true;
    } catch {
      return false;
    } finally {
      await db.destroy();
    }
  };
};

@Module({})
export class ApiModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: ApiModule,
      imports: [
        HealthModule.register(createProductionDatabaseCheck(databaseUrl)),
      ],
    };
  }

  static forTest(options: ApiModuleTestOptions): DynamicModule {
    return {
      module: ApiModule,
      imports: [HealthModule.register(options.databaseCheck)],
    };
  }
}
