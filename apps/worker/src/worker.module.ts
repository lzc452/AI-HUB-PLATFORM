import { Module } from "@nestjs/common";
import { createDatabase } from "@ai-hub/database";
import { HealthModule } from "@ai-hub/server";

const createWorkerDatabaseCheck = (databaseUrl: string) => {
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
export class WorkerModule {
  static register(databaseUrl: string) {
    return {
      module: WorkerModule,
      imports: [HealthModule.register(createWorkerDatabaseCheck(databaseUrl))],
    };
  }
}
