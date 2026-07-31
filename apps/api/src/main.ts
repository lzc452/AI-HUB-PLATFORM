import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseRuntimeConfig } from "@ai-hub/config";

import { ApiModule } from "./api.module.js";

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const app = await NestFactory.create(ApiModule.register(config.databaseUrl));

  app.enableShutdownHooks(["SIGTERM"]);

  await app.listen(config.apiPort);
}

await bootstrap();
