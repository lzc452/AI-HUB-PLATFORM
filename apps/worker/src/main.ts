import { existsSync } from "node:fs";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import "reflect-metadata";

// 本地开发时加载根目录 .env；生产环境由 Docker Compose 注入，.env 不存在则跳过
const envPath = "../../.env";
const processWithEnvLoader = process as typeof process & {
  loadEnvFile?: (path?: string) => void;
};
if (existsSync(envPath)) processWithEnvLoader.loadEnvFile?.(envPath);

import { NestFactory } from "@nestjs/core";
import { parseRuntimeConfig } from "@ai-hub/config";
import { createDatabase } from "@ai-hub/database";
import {
  createApplicationLogger,
  createOutboxCountCollector,
  createUsageAggregationRunner,
  KyselyLlmUsageRepository,
  LlmUsageAggregator,
  ObservabilityMetrics,
  PinoNestLogger,
  ArtifactVerificationWorker,
  ClamAvMalwareScanner,
  DiskObjectStorage,
  GarageObjectStorage,
  Ed25519ArtifactSigner,
  KyselyApplicationRepository,
  AuditExportWorker,
  KyselyAuditRepository,
  createSlaReminderRunner,
  type ReadableObjectStoragePort,
} from "@ai-hub/server";

import { startWorkerMetricsServer } from "./metrics-server.js";
import { createRetentionRunner, WorkerModule } from "./worker.module.js";
import { runOutboxPollingLoop } from "./outbox-poller.js";

/**
 * 模型用量聚合间隔。
 *
 * 选 5 分钟的理由：聚合是「读事实表 → 重写当日读模型」的汇总，成本可控；
 * 而**日配额判定直接读事实表、不依赖聚合**，所以这个间隔只影响看板新鲜度，
 * 不影响配额准确性（把这条写进注释，是为了避免后人误以为调大间隔会放松配额）。
 */
const USAGE_AGGREGATION_INTERVAL_MS = 5 * 60 * 1000;

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const logger = createApplicationLogger(config.logLevel);
  const database = createDatabase(config.databaseUrl);
  const metrics = new ObservabilityMetrics({
    collectOutboxCounts: createOutboxCountCollector(database),
  });
  const artifactStorage: ReadableObjectStoragePort =
    config.objectStorageDriver === "garage"
      ? new GarageObjectStorage(config.objectStorageBucket, {
          endpoint: config.objectStorageEndpoint as string,
          region: config.objectStorageRegion,
          accessKeyId: config.objectStorageAccessKey as string,
          secretAccessKey: config.objectStorageSecretKey as string,
          forcePathStyle: config.objectStorageForcePathStyle,
        })
      : new DiskObjectStorage(config.storageDirectory);
  const signingKeys =
    config.artifactSigningPrivateKey !== undefined &&
    config.artifactSigningPublicKey !== undefined
      ? {
          privateKeyPem: config.artifactSigningPrivateKey,
          publicKeyPem: config.artifactSigningPublicKey,
        }
      : config.nodeEnv === "production"
        ? undefined
        : (() => {
            const generated = generateKeyPairSync("ed25519", {
              privateKeyEncoding: { format: "pem", type: "pkcs8" },
              publicKeyEncoding: { format: "pem", type: "spki" },
            });
            return {
              privateKeyPem: generated.privateKey,
              publicKeyPem: generated.publicKey,
            };
          })();
  const artifactVerificationWorker =
    config.artifactUploadEnabled && signingKeys !== undefined
      ? new ArtifactVerificationWorker({
          repository: new KyselyApplicationRepository(database),
          storage: artifactStorage,
          scanner: new ClamAvMalwareScanner(
            config.clamavHost,
            config.clamavPort,
            config.clamavTimeoutMs,
          ),
          signer: new Ed25519ArtifactSigner(signingKeys),
          verifier: new Ed25519ArtifactSigner(signingKeys),
        })
      : undefined;
  const auditExportWorker = new AuditExportWorker(
    new KyselyAuditRepository(database),
    artifactStorage,
  );
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(
      database,
      metrics,
      config.outboxLeaseDurationMs,
      artifactVerificationWorker?.handler,
      auditExportWorker?.handler,
    ),
    { logger: new PinoNestLogger(logger) },
  );
  const metricsListener = await startWorkerMetricsServer(
    metrics,
    config.workerMetricsPort,
  );
  const { WorkerOutboxRuntime } = await import("./worker.module.js");
  const runtime = app.get(WorkerOutboxRuntime);
  const workerId = randomUUID();
  const retentionRunner = createRetentionRunner(runtime.retention);
  await retentionRunner();
  const retentionTimer = setInterval(
    () => {
      void retentionRunner().catch((error: unknown) => {
        logger.error({ error }, "分析保留任务执行失败");
      });
    },
    24 * 60 * 60 * 1000,
  );
  // 系统进程发出的站内提醒，授权固定通过（RBAC 校验不适用于后台任务）。
  const systemActor = {
    employeeId: "system-sla-reminder",
    roleCodes: ["super_admin"],
    departmentIds: [],
    primaryDepartmentId: "",
    sessionId: "sla-reminder",
  };
  const slaReminderRunner = createSlaReminderRunner({
    listReviewsDueWithin: runtime.reviewRepository.listReviewsDueWithin.bind(
      runtime.reviewRepository,
    ),
    listExpiredReviews: runtime.reviewRepository.listExpiredReviews.bind(
      runtime.reviewRepository,
    ),
    listExpiredClaims: runtime.reviewRepository.listExpiredClaims.bind(
      runtime.reviewRepository,
    ),
    releaseClaim: async (applicationVersionId, claimedByEmployeeId) => {
      await runtime.reviewRepository.releaseReviewQueue(
        applicationVersionId,
        claimedByEmployeeId,
      );
    },
    listApplicationAdmins: async () => {
      const [admins, superAdmins] = await Promise.all([
        runtime.identityRepository.listEmployeeIdsWithRole("application_admin"),
        runtime.identityRepository.listEmployeeIdsWithRole("super_admin"),
      ]);
      return [...new Set([...admins, ...superAdmins])];
    },
    listApplicationReviewers: () =>
      // 按权限码而非角色码：application_reviewer 这个角色码在
      // SYSTEM_ROLE_DEFINITIONS 里并不存在，写死它会让 SLA 提醒永远发给空集。
      runtime.identityRepository.listEmployeeIdsWithPermission(
        "application.review",
      ),
    createNotification: async (input) => {
      await runtime.notifications.createForEvent(systemActor, input);
    },
  });
  await slaReminderRunner();
  const slaTimer = setInterval(
    () => {
      void slaReminderRunner().catch((error: unknown) => {
        logger.error({ error }, "审核 SLA 提醒任务执行失败");
      });
    },
    15 * 60 * 1000,
  );
  const artifactRecoveryTimer =
    artifactVerificationWorker === undefined
      ? undefined
      : setInterval(() => {
          void artifactVerificationWorker
            .reconcileStale(new Date(Date.now() - config.outboxLeaseDurationMs))
            .catch((error: unknown) => {
              logger.error({ error }, "artifact verification recovery failed");
            });
        }, config.outboxLeaseDurationMs);

  const usageAggregator = new LlmUsageAggregator(
    new KyselyLlmUsageRepository(database),
    { logger },
  );
  const usageRunner = createUsageAggregationRunner(usageAggregator, {
    lookbackDays: 2,
    gapScanDays: 30,
    maxGapDaysPerRun: 10,
  });
  const runUsageAggregation = (): void => {
    void usageRunner()
      .then((result) => {
        logger.info(
          {
            aggregatedDays: result.days.length,
            gaps: result.gaps.length,
            skippedGaps: result.skippedGaps,
          },
          "模型用量聚合完成",
        );
      })
      .catch((error: unknown) => {
        logger.error({ error }, "模型用量聚合失败");
      });
  };
  // 启动即跑一次：否则重启后当日看板要等到下一个周期才有数据
  runUsageAggregation();
  const usageAggregationTimer = setInterval(
    runUsageAggregation,
    USAGE_AGGREGATION_INTERVAL_MS,
  );

  await runOutboxPollingLoop(
    {
      outboxWorker: runtime.outboxWorker,
      close: async () => {
        clearInterval(retentionTimer);
        clearInterval(slaTimer);
        clearInterval(usageAggregationTimer);
        if (artifactRecoveryTimer !== undefined)
          clearInterval(artifactRecoveryTimer);
        await metricsListener.close();
        await app.close();
      },
    },
    workerId,
    config.outboxPollIntervalMs,
  );
}

await bootstrap();
