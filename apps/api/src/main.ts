import { existsSync } from "node:fs";
import "reflect-metadata";

// 本地开发时加载根目录 .env；生产环境由 Docker Compose 注入，.env 不存在则跳过
const envPath = "../../.env";
const processWithEnvLoader = process as typeof process & {
  loadEnvFile?: (path?: string) => void;
};
if (existsSync(envPath)) processWithEnvLoader.loadEnvFile?.(envPath);

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
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
  createRateLimitMiddleware,
  ArtifactPipeline,
  DiskObjectStorage,
  GarageObjectStorage,
  type ReadableObjectStoragePort,
} from "@ai-hub/server";

import { ApiModule } from "./api.module.js";
import { configureApiBodyParsers } from "./body-parser.js";
import { configureSwagger, shouldEnableApiDocs } from "./swagger.js";

async function bootstrap() {
  const config = parseRuntimeConfig(process.env);
  const logger = createApplicationLogger(config.logLevel);
  const database = createDatabase(config.databaseUrl);
  const replayDatabase = database;
  const metrics = new ObservabilityMetrics({
    collectOutboxCounts: createOutboxCountCollector(database),
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

  const artifactStorage: ReadableObjectStoragePort | undefined =
    config.artifactUploadEnabled
      ? config.objectStorageDriver === "garage"
        ? new GarageObjectStorage(config.objectStorageBucket, {
            endpoint: config.objectStorageEndpoint as string,
            region: config.objectStorageRegion,
            accessKeyId: config.objectStorageAccessKey as string,
            secretAccessKey: config.objectStorageSecretKey as string,
            forcePathStyle: config.objectStorageForcePathStyle,
          })
        : new DiskObjectStorage(config.storageDirectory)
      : undefined;
  const app = await NestFactory.create<NestExpressApplication>(
    ApiModule.register(
      database,
      { logger, metrics },
      artifactStorage === undefined
        ? undefined
        : createArtifactVerification(
            artifactStorage,
            config.nodeEnv !== "production",
          ),
      identityOptions,
      config.objectStorageDriver === "disk" && config.artifactUploadEnabled
        ? config.storageDirectory
        : undefined,
      config.artifactMaxSizeBytes,
      artifactStorage,
    ),
    { logger: new PinoNestLogger(logger) },
  );

  // 安全地基：全局校验管道。whitelist 剔除请求体中任何未声明校验装饰器的字段，
  // 阻断 mass-assignment 与多余字段注入；transform 按 DTO 装饰器做类型转换。
  // 注意：所有请求 DTO 必须带 class-validator 装饰器，否则合法字段会被一并剔除。
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.use(createHttpLogger(logger));
  app.use(
    createRateLimitMiddleware({
      limits: [
        // 登录端点：固定频率限制（规格 §5.1 要求的最低限度）
        {
          matcher: (p) => p === "/internal/identity/login/password",
          windowMs: 60_000,
          max: 5,
          keySource: "ip",
        },
        {
          matcher: (p) => p === "/internal/identity/login/challenge",
          windowMs: 60_000,
          max: 10,
          keySource: "ip",
        },
        {
          matcher: (p) => p === "/internal/identity/login/challenge",
          windowMs: 60_000,
          max: 20,
          keySource: "ip+account",
        },
      ],
    }),
  );
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
  configureApiBodyParsers(app, config.artifactMaxSizeBytes);

  await app.listen(config.apiPort);
}

/** 本地直传仅保留隔离链路；生产环境未接入真实扫描与签名 adapter 时必须失败关闭。
 * 非生产环境（本地开发/验证）使用接受桩，使发布链可在无安全适配器时跑通。 */
function createArtifactVerification(
  storage: import("@ai-hub/server").ObjectStoragePort,
  acceptInDevelopment: boolean,
): ArtifactPipeline {
  if (acceptInDevelopment) {
    return new ArtifactPipeline(storage, {
      async scan() {
        return "clean";
      },
      async verify() {
        return true;
      },
    });
  }
  return new ArtifactPipeline(storage, {
    async scan() {
      throw new Error("ARTIFACT_SECURITY_UNAVAILABLE");
    },
    async verify() {
      throw new Error("ARTIFACT_SECURITY_UNAVAILABLE");
    },
  });
}

await bootstrap();
