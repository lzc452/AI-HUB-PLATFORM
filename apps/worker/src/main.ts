import "reflect-metadata";

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
    WorkerModule.register(config.databaseUrl, metrics),
    { logger: new PinoNestLogger(logger) },
  );
  const metricsListener = await startWorkerMetricsServer(
    metrics,
    config.workerMetricsPort,
  );
  const { WorkerOutboxRuntime } = await import("./worker.module.js");
  const runtime = app.get(WorkerOutboxRuntime);
  const workerId = `worker-${process.pid}`;
  const retentionRunner = createRetentionRunner(runtime.retention);
  await retentionRunner();
  const retentionTimer = setInterval(
    () => {
      void retentionRunner().catch((error: unknown) => {
        logger.error({ error }, "analytics retention job failed");
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
