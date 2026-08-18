import { Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDatabase, OutboxStore } from "@ai-hub/database";
import type { DatabaseSchema } from "@ai-hub/database";
import type { Kysely } from "kysely";
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
  KyselyApplicationRepository,
  KyselyIdentityRepository,
  KyselyNotificationRepository,
  NotificationService,
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
  artifactVerificationHandler?: OutboxHandler,
  auditExportHandler?: OutboxHandler,
): OutboxHandlerMap {
  return {
    ...outboxHandlers,
    ...(artifactVerificationHandler === undefined
      ? {}
      : {
          "artifact.verification.requested": artifactVerificationHandler,
          "artifact.verification.completed": systemProbeRequestedHandler,
          "artifact.verification.failed": systemProbeRequestedHandler,
        }),
    ...(auditExportHandler === undefined
      ? {}
      : { "security.audit.export.requested": auditExportHandler }),
    "notification.created": createDingTalkNotificationOutboxHandler(
      new KyselyNotificationRepository(database),
      unavailableDingTalk,
    ),
  };
}

const createWorkerDatabaseCheck = (database: Kysely<DatabaseSchema>) => {
  return async () => {
    try {
      await database
        .selectFrom("outbox_events")
        .select("id")
        .limit(1)
        .execute();
      return true;
    } catch {
      return false;
    }
  };
};

export class WorkerOutboxRuntime implements OnApplicationShutdown {
  public constructor(
    private readonly database: ReturnType<typeof createDatabase>,
    public readonly outboxWorker: OutboxWorker,
    public readonly retention: AnalyticsRetentionService,
    public readonly reviewRepository: KyselyApplicationRepository,
    public readonly identityRepository: KyselyIdentityRepository,
    public readonly notifications: NotificationService,
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
    databaseOrUrl: string | Kysely<DatabaseSchema>,
    metrics: ObservabilityMetrics = new ObservabilityMetrics(),
    outboxLeaseDurationMs = 15 * 60 * 1000,
    artifactVerificationHandler?: OutboxHandler,
    auditExportHandler?: OutboxHandler,
  ) {
    const database =
      typeof databaseOrUrl === "string"
        ? createDatabase(databaseOrUrl)
        : databaseOrUrl;
    return {
      module: WorkerModule,
      imports: [HealthModule.register(createWorkerDatabaseCheck(database))],
      providers: [
        {
          provide: WorkerOutboxRuntime,
          useFactory: () => {
            const outboxStore = new OutboxStore(database, {
              leaseDurationMs: outboxLeaseDurationMs,
            });
            const outboxWorker = new OutboxWorker(
              outboxStore,
              createOutboxHandlers(
                database,
                artifactVerificationHandler,
                auditExportHandler,
              ),
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
              new KyselyApplicationRepository(database),
              new KyselyIdentityRepository(database),
              new NotificationService(
                new KyselyNotificationRepository(database),
                // worker 是系统进程：后台提醒不需要按员工授权。
                {
                  authorize: async () => ({
                    allowed: true,
                    reasonCode: "SYSTEM_ACTOR",
                  }),
                },
                unavailableDingTalk,
              ),
            );
          },
        },
      ],
    };
  }
}
