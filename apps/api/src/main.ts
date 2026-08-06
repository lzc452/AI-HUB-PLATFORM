import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseRuntimeConfig } from "@ai-hub/config";
import { createDatabase } from "@ai-hub/database";
import {
  createApplicationLogger,
  createHttpLogger,
  createOutboxCountCollector,
  ObservabilityMetrics,
  PinoNestLogger,
  KyselyReplayNonceRepository,
  createProductionSecurityMiddleware,
} from "@ai-hub/server";

import { ApiModule } from "./api.module.js";
import { configureSwagger, shouldEnableApiDocs } from "./swagger.js";

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const logger = createApplicationLogger(config.logLevel);
  const replayDatabase = createDatabase(config.databaseUrl);
  const metrics = new ObservabilityMetrics({
    collectOutboxCounts: createOutboxCountCollector(config.databaseUrl),
  });
  const app = await NestFactory.create(
    ApiModule.register(config.databaseUrl, { logger, metrics }),
    { logger: new PinoNestLogger(logger) },
  );

  app.use(createHttpLogger(logger));
  app.use(
    createProductionSecurityMiddleware({
      enabled: config.nodeEnv === "production",
      expectedOrigin:
        process.env.PUBLIC_ORIGIN ??
        `https://${process.env.PUBLIC_HOSTNAME ?? "localhost"}`,
      replayStore: new KyselyReplayNonceRepository(replayDatabase),
    }),
  );
  configureSwagger(app, {
    enabled: shouldEnableApiDocs(config.nodeEnv, config.enableApiDocs),
  });
  app.enableShutdownHooks(["SIGTERM"]);

  await app.listen(config.apiPort);
}

await bootstrap();
