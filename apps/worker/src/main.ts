import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseRuntimeConfig } from "@ai-hub/config";

import { WorkerModule } from "./worker.module.js";
import { runOutboxPollingLoop } from "./outbox-poller.js";

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(config.databaseUrl),
  );
  const { WorkerOutboxRuntime } = await import("./worker.module.js");
  const runtime = app.get(WorkerOutboxRuntime);
  const workerId = `worker-${process.pid}`;

  await runOutboxPollingLoop(
    {
      outboxWorker: runtime.outboxWorker,
      close: async () => {
        await app.close();
      },
    },
    workerId,
    config.outboxPollIntervalMs,
  );
}

await bootstrap();
