import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseRuntimeConfig } from "@ai-hub/config";
import {
  createApplicationLogger,
  createHttpLogger,
  createOutboxCountCollector,
  ObservabilityMetrics,
  PinoNestLogger,
} from "@ai-hub/server";

import { ApiModule } from "./api.module.js";

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const logger = createApplicationLogger(config.logLevel);
  const metrics = new ObservabilityMetrics({
    collectOutboxCounts: createOutboxCountCollector(config.databaseUrl),
  });
  const app = await NestFactory.create(
    ApiModule.register(config.databaseUrl, { logger, metrics }),
    { logger: new PinoNestLogger(logger) },
  );

  app.use(createHttpLogger(logger));
  app.enableShutdownHooks(["SIGTERM"]);

  await app.listen(config.apiPort);
}

await bootstrap();
