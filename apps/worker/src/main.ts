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
    listApplicationAdmins: async () => {
      const [admins, superAdmins] = await Promise.all([
        runtime.identityRepository.listEmployeeIdsWithRole("application_admin"),
        runtime.identityRepository.listEmployeeIdsWithRole("super_admin"),
      ]);
      return [...new Set([...admins, ...superAdmins])];
    },
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

  await runOutboxPollingLoop(
    {
      outboxWorker: runtime.outboxWorker,
      close: async () => {
        clearInterval(retentionTimer);
        clearInterval(slaTimer);
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
