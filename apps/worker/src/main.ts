import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import "reflect-metadata";

// 本地开发时加载根目录 .env；生产环境由 Docker Compose 注入，.env 不存在则跳过
const envPath = "../../.env";
const processWithEnvLoader = process as typeof process & {
  loadEnvFile?: (path?: string) => void;
};
if (existsSync(envPath)) processWithEnvLoader.loadEnvFile?.(envPath);

import { NestFactory } from "@nestjs/core";
import { parseRuntimeConfig } from "@ai-hub/config";
import {
  createApplicationLogger,
  createOutboxCountCollector,
  ObservabilityMetrics,
  PinoNestLogger,
} from "@ai-hub/server";

import { startWorkerMetricsServer } from "./metrics-server.js";
import { createRetentionRunner, WorkerModule } from "./worker.module.js";
import { runOutboxPollingLoop } from "./outbox-poller.js";

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const logger = createApplicationLogger(config.logLevel);
  const metrics = new ObservabilityMetrics({
    collectOutboxCounts: createOutboxCountCollector(config.databaseUrl),
  });
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(
      config.databaseUrl,
      metrics,
      config.outboxLeaseDurationMs,
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

  await runOutboxPollingLoop(
    {
      outboxWorker: runtime.outboxWorker,
      close: async () => {
        clearInterval(retentionTimer);
        await metricsListener.close();
        await app.close();
      },
    },
    workerId,
    config.outboxPollIntervalMs,
  );
}

await bootstrap();
