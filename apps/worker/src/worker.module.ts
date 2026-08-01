import { Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDatabase, OutboxStore } from "@ai-hub/database";
import {
  HealthModule,
  ObservabilityMetrics,
  OutboxWorker,
  type OutboxHandler,
  type OutboxHandlerMap,
} from "@ai-hub/server";

export const systemProbeRequestedHandler: OutboxHandler = async () => {};

export const outboxHandlers: OutboxHandlerMap = {
  "system.probe.requested": systemProbeRequestedHandler,
};

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

export class WorkerOutboxRuntime implements OnApplicationShutdown {
  public constructor(
    private readonly database: ReturnType<typeof createDatabase>,
    public readonly outboxWorker: OutboxWorker,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.database.destroy();
  }
}

@Module({})
export class WorkerModule {
  static register(
    databaseUrl: string,
    metrics: ObservabilityMetrics = new ObservabilityMetrics(),
  ) {
    return {
      module: WorkerModule,
      imports: [HealthModule.register(createWorkerDatabaseCheck(databaseUrl))],
      providers: [
        {
          provide: WorkerOutboxRuntime,
          useFactory: () => {
            const database = createDatabase(databaseUrl);
            const outboxWorker = new OutboxWorker(
              new OutboxStore(database),
              outboxHandlers,
              undefined,
              metrics,
            );
            return new WorkerOutboxRuntime(database, outboxWorker);
          },
        },
      ],
    };
  }
}
