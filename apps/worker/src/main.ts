import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseRuntimeConfig } from "@ai-hub/config";

import { WorkerModule } from "./worker.module.js";

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(config.databaseUrl),
  );

  app.enableShutdownHooks(["SIGTERM"]);
}

await bootstrap();
