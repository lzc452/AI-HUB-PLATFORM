import { existsSync } from "node:fs";
import "reflect-metadata";

// 本地开发时加载根目录 .env；生产环境由 Docker Compose 注入，.env 不存在则跳过
const envPath = "../../.env";
const processWithEnvLoader = process as typeof process & {
  loadEnvFile?: (path?: string) => void;
};
if (existsSync(envPath)) processWithEnvLoader.loadEnvFile?.(envPath);

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
  ArtifactPipeline,
  DiskObjectStorage,
  createNoopSecurity,
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
  const identityOptions: {
    loginEncryptionPrivateKey?: string;
    dingtalkSso?: {
      clientId: string;
      clientSecret: string;
      corpId: string;
      redirectUri: string;
    };
  } = {};
  if (config.loginEncryptionPrivateKey !== undefined) {
    identityOptions.loginEncryptionPrivateKey =
      config.loginEncryptionPrivateKey;
  }
  if (
    config.dingtalkSsoEnabled &&
    config.dingtalkClientId !== undefined &&
    config.dingtalkClientSecret !== undefined &&
    config.dingtalkCorpId !== undefined &&
    config.dingtalkRedirectUri !== undefined
  ) {
    identityOptions.dingtalkSso = {
      clientId: config.dingtalkClientId,
      clientSecret: config.dingtalkClientSecret,
      corpId: config.dingtalkCorpId,
      redirectUri: config.dingtalkRedirectUri,
    };
  }

  const artifactStorage = new DiskObjectStorage(config.storageDirectory);
  const app = await NestFactory.create<NestExpressApplication>(
    ApiModule.register(
      config.databaseUrl,
      { logger, metrics },
      createArtifactVerification(artifactStorage),
      identityOptions,
      config.storageDirectory,
      config.artifactMaxSizeBytes,
      artifactStorage,
    ),
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
  app.useBodyParser("json", { limit: "2.5gb" });
  app.useBodyParser("raw", {
    limit: "2.5gb",
    type: ["application/octet-stream"],
  });

  await app.listen(config.apiPort);
}

/** 生产装配：Disk 对象存储 + Noop 安全组件 → ArtifactPipeline（V1 先行实现）。 */
function createArtifactVerification(
  storage: DiskObjectStorage,
): ArtifactPipeline {
  return new ArtifactPipeline(storage, createNoopSecurity());
}

await bootstrap();
