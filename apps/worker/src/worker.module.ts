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

/**
 * Portal 生命周期当前已在同一事务中写入业务状态与安全审计；Worker 负责校验
 * 事件载荷并确认消费，避免已知 Portal 事件因缺少下游订阅者被隔离。后续通知、
 * 搜索索引等订阅者可在此处理器之后按事件类型替换，无需改变业务事务。
 */
export const portalLifecycleRecordedHandler: OutboxHandler = async (event) => {
  if (typeof event.payload !== "object" || event.payload === null) {
    throw new Error("PORTAL_OUTBOX_PAYLOAD_INVALID");
  }
  const payload = event.payload as {
    resourceId?: unknown;
    resourceType?: unknown;
  };
  if (
    typeof payload.resourceId !== "string" ||
    !["app", "skill", "plugin", "mcp"].includes(
      String(payload.resourceType),
    )
  ) {
    throw new Error("PORTAL_OUTBOX_PAYLOAD_INVALID");
  }
};

const portalResourceTypes = ["app", "skill", "plugin", "mcp"] as const;
const portalLifecycleEvents = [
  "draft.created",
  "draft.updated",
  "version.created",
  "status.in_review",
  "status.approved",
  "status.draft",
  "status.published",
  "status.withdrawn",
] as const;

const portalOutboxHandlers = Object.fromEntries(
  portalResourceTypes.flatMap((type) =>
    portalLifecycleEvents.map((event) => [
      `portal.${type}.${event}`,
      portalLifecycleRecordedHandler,
    ]),
  ),
) as OutboxHandlerMap;

const unavailableDingTalk = {
  async send() {
    return { delivered: false, errorCode: "DINGTALK_UNAVAILABLE" };
  },
};

/** 后台进程 actor：站内通知的授权固定放行（与 SLA 提醒一致）。 */
const systemActor = {
  employeeId: "system-artifact-verification",
  roleCodes: ["super_admin"],
  departmentIds: [],
  primaryDepartmentId: "",
  sessionId: "artifact-verification",
};

/**
 * artifact.verification.failed outbox 事件 → 站内通知上传者
 * （矩阵场景 artifact.verification.failed，recipientRole: artifact_uploader）。
 * 消息与矩阵模板一致；幂等键 `${eventType}:${aggregateId}:${recipient}` 保证
 * 同一应用多次校验失败只入站一条通知。上传记录不存在（已被清理）时静默跳过。
 */
export function createArtifactVerificationFailedNotificationHandler(
  notifications: NotificationService,
  repository: KyselyApplicationRepository,
): OutboxHandler {
  return async (event) => {
    const payload = event.payload as {
      applicationId?: string;
      details?: { uploadId?: string; errorCode?: string };
    };
    const uploadId = payload?.details?.uploadId;
    if (typeof uploadId !== "string") return;
    const upload = await repository.findArtifactUpload(uploadId);
    if (upload === null) return;
    const errorCode =
      payload.details?.errorCode ?? "ARTIFACT_VERIFICATION_FAILED";
    await notifications.createForEvent(systemActor, {
      recipientEmployeeId: upload.uploadedByEmployeeId,
      eventType: "artifact.verification.failed",
      aggregateId: upload.applicationId,
      message: `安装包 ${upload.applicationId} 校验失败：${errorCode}。`,
      metadata: {
        notificationScenario: "artifact.verification.failed",
        recipientRole: "artifact_uploader",
        actorEmployeeId: systemActor.employeeId,
      },
    });
  };
}

export const outboxHandlers: OutboxHandlerMap = {
  "system.probe.requested": systemProbeRequestedHandler,
  ...portalOutboxHandlers,
};

export function createOutboxHandlers(
  database: ReturnType<typeof createDatabase>,
  artifactVerificationHandler?: OutboxHandler,
  auditExportHandler?: OutboxHandler,
  artifactVerificationFailedNotificationHandler?: OutboxHandler,
): OutboxHandlerMap {
  return {
    ...outboxHandlers,
    ...(artifactVerificationHandler === undefined
      ? {}
      : {
          "artifact.verification.requested": artifactVerificationHandler,
          "artifact.verification.completed": systemProbeRequestedHandler,
        }),
    ...(artifactVerificationFailedNotificationHandler === undefined
      ? {}
      : {
          "artifact.verification.failed":
            artifactVerificationFailedNotificationHandler,
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
            const applicationRepository = new KyselyApplicationRepository(
              database,
            );
            const notifications = new NotificationService(
              new KyselyNotificationRepository(database),
              // worker 是系统进程：后台提醒不需要按员工授权。
              {
                authorize: async () => ({
                  allowed: true,
                  reasonCode: "SYSTEM_ACTOR",
                }),
              },
              unavailableDingTalk,
            );
            const outboxWorker = new OutboxWorker(
              outboxStore,
              createOutboxHandlers(
                database,
                artifactVerificationHandler,
                auditExportHandler,
                createArtifactVerificationFailedNotificationHandler(
                  notifications,
                  applicationRepository,
                ),
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
              applicationRepository,
              new KyselyIdentityRepository(database),
              notifications,
            );
          },
        },
      ],
    };
  }
}
