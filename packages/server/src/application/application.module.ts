import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { ApplicationController } from "./application.controller.js";
import { ArtifactUploadController } from "./artifact-upload.controller.js";
import { UnifiedUploadController } from "./unified-upload.controller.js";
import { KyselyApplicationRepository } from "./application.repository.js";
import { ApplicationService } from "./application.service.js";
import {
  APPLICATION_SERVICE,
  ARTIFACT_MAX_SIZE_BYTES,
  ARTIFACT_PIPELINE,
  ARTIFACT_STORAGE,
} from "./application.tokens.js";
import { ArtifactPipeline } from "./storage.pipeline.js";
import { DiskObjectStorage } from "./storage.disk.js";
import type {
  ArtifactVerificationPort,
  ReadableObjectStoragePort,
} from "./storage.port.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";
import { NotificationModule } from "../notification/notification.module.js";
import { DINGTALK_NOTIFICATION_MATRIX_SERVICE } from "../notification/notification.tokens.js";
import type { DingTalkNotificationMatrixService } from "../notification/dingtalk-matrix.service.js";
import {
  DENY_ALL_WEB_TARGETS,
  type WebTargetPolicy,
} from "../system/security/web-url-policy.js";

const unavailableArtifactVerifier: ArtifactVerificationPort = {
  async verifyArtifact() {
    throw new Error("ARTIFACT_VERIFIER_UNAVAILABLE");
  },
};

/** V1 单请求 raw body 上限；与运行时配置默认值保持一致。 */
const DEFAULT_ARTIFACT_MAX_SIZE_BYTES = 64 * 1024 * 1024;

function createRepositoryProvider(database: Kysely<DatabaseSchema>): Provider {
  return {
    provide: KyselyApplicationRepository,
    useValue: new KyselyApplicationRepository(database),
  };
}

function createApplicationServiceProvider(
  database: Kysely<DatabaseSchema>,
  artifactVerifier: ArtifactVerificationPort,
  webTargetPolicy: WebTargetPolicy,
) {
  const analyticsEvents = new AnalyticsEventService(
    new KyselyAnalyticsEventRepository(database),
  );

  return {
    provide: APPLICATION_SERVICE,
    useFactory: (
      repository: KyselyApplicationRepository,
      identity: IdentityService,
      notifications: DingTalkNotificationMatrixService,
    ) =>
      new ApplicationService(
        repository,
        identity,
        artifactVerifier,
        analyticsEvents,
        notifications,
        webTargetPolicy,
      ),
    inject: [
      KyselyApplicationRepository,
      IdentityService,
      DINGTALK_NOTIFICATION_MATRIX_SERVICE,
    ],
  };
}

function createUploadProviders(
  artifactVerifier: ArtifactVerificationPort,
  storageDirectory: string | undefined,
  maxSizeBytes: number,
  configuredStorage?: ReadableObjectStoragePort,
): Provider[] {
  if (storageDirectory === undefined && configuredStorage === undefined)
    return [];
  const storage =
    configuredStorage ?? new DiskObjectStorage(storageDirectory as string);
  const pipeline =
    artifactVerifier instanceof ArtifactPipeline
      ? artifactVerifier
      : new ArtifactPipeline(storage, {
          scan: () =>
            Promise.reject(new Error("ARTIFACT_SECURITY_UNAVAILABLE")),
          verify: () =>
            Promise.reject(new Error("ARTIFACT_SECURITY_UNAVAILABLE")),
        });
  return [
    { provide: ARTIFACT_STORAGE, useValue: storage },
    { provide: ARTIFACT_PIPELINE, useValue: pipeline },
    { provide: ARTIFACT_MAX_SIZE_BYTES, useValue: maxSizeBytes },
  ];
}

function createUploadControllers(
  storageDirectory: string | undefined,
  configuredStorage?: ReadableObjectStoragePort,
): (typeof ArtifactUploadController | typeof UnifiedUploadController)[] {
  return storageDirectory === undefined && configuredStorage === undefined
    ? []
    : [ArtifactUploadController, UnifiedUploadController];
}

@Module({})
export class ApplicationModule {
  static registerService(
    database: Kysely<DatabaseSchema>,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
    webTargetPolicy: WebTargetPolicy = DENY_ALL_WEB_TARGETS,
  ): DynamicModule {
    return {
      module: ApplicationModule,
      imports: [
        IdentityModule.register(database),
        NotificationModule.register(database),
      ],
      providers: [
        createRepositoryProvider(database),
        createApplicationServiceProvider(
          database,
          artifactVerifier,
          webTargetPolicy,
        ),
      ],
      exports: [APPLICATION_SERVICE],
    };
  }

  static register(
    database: Kysely<DatabaseSchema>,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
    storageDirectory?: string,
    artifactMaxSizeBytes: number = DEFAULT_ARTIFACT_MAX_SIZE_BYTES,
    artifactStorage?: ReadableObjectStoragePort,
    /**
     * 内网 Web URL 白名单（规格 §11.3）。未提供时默认拒绝一切 Web 目标
     * （fail-closed），确保装配点不会静默绕过校验。
     */
    webTargetPolicy: WebTargetPolicy = DENY_ALL_WEB_TARGETS,
  ): DynamicModule {
    return {
      module: ApplicationModule,
      imports: [
        IdentityModule.register(database),
        NotificationModule.register(database),
      ],
      controllers: [
        ApplicationController,
        ...createUploadControllers(storageDirectory, artifactStorage),
      ],
      providers: [
        createRepositoryProvider(database),
        createApplicationServiceProvider(
          database,
          artifactVerifier,
          webTargetPolicy,
        ),
        ...createUploadProviders(
          artifactVerifier,
          storageDirectory,
          artifactMaxSizeBytes,
          artifactStorage,
        ),
      ],
      exports: [APPLICATION_SERVICE],
    };
  }

  static forTest(
    application: ApplicationService,
    identity: IdentityService,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
    storageDirectory?: string,
  ): DynamicModule {
    return {
      module: ApplicationModule,
      controllers: [
        ApplicationController,
        ...createUploadControllers(storageDirectory),
      ],
      providers: [
        { provide: APPLICATION_SERVICE, useValue: application },
        { provide: IdentityService, useValue: identity },
        { provide: "ARTIFACT_VERIFIER", useValue: artifactVerifier },
        ...createUploadProviders(
          artifactVerifier,
          storageDirectory,
          64 * 1024 * 1024,
        ),
      ],
      exports: [APPLICATION_SERVICE],
    };
  }
}
