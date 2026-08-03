import { Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDatabase, OutboxStore } from "@ai-hub/database";
import {
  HealthModule,
  ObservabilityMetrics,
  OutboxWorker,
  type OutboxHandler,
  type OutboxHandlerMap,
  AnalyticsRetentionService,
  KyselyAnalyticsRetentionRepository,
  AnalyticsEventService,
  KyselyAnalyticsEventRepository,
  KyselyNotificationRepository,
  createDingTalkNotificationOutboxHandler,
} from "@ai-hub/server";

export const systemProbeRequestedHandler: OutboxHandler = async () => {};

const unavailableDingTalk = {
  async send() {
    return { delivered: false, errorCode: "DINGTALK_UNAVAILABLE" };
  },
};

export const outboxHandlers: OutboxHandlerMap = {
  "system.probe.requested": systemProbeRequestedHandler,
};

export function createOutboxHandlers(
  database: ReturnType<typeof createDatabase>,
): OutboxHandlerMap {
  return {
    ...outboxHandlers,
    "notification.created": createDingTalkNotificationOutboxHandler(
      new KyselyNotificationRepository(database),
      unavailableDingTalk,
    ),
  };
}

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
    public readonly retention: AnalyticsRetentionService,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.database.destroy();
  }
}

export function createRetentionRunner(retention: {
  run(): Promise<{ deleted: number }>;
}): () => Promise<{ deleted: number }> {
  return () => retention.run();
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
              createOutboxHandlers(database),
              undefined,
              metrics,
            );
            return new WorkerOutboxRuntime(
              database,
              outboxWorker,
              new AnalyticsRetentionService(
                new KyselyAnalyticsRetentionRepository(database),
                new AnalyticsEventService(
                  new KyselyAnalyticsEventRepository(database),
                ),
              ),
            );
          },
        },
      ],
    };
  }
}
