import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { ApplicationController } from "./application.controller.js";
import { ArtifactUploadController } from "./artifact-upload.controller.js";
import { UnifiedUploadController } from "./unified-upload.controller.js";
import { PortalApplicationUploadController } from "./portal-application-upload.controller.js";
import { PortalApplicationAssetController } from "./portal-application-asset.controller.js";
import { ApplicationUploadService } from "./application-upload.service.js";
import { KyselyApplicationRepository } from "./application.repository.js";
import { ApplicationService } from "./application.service.js";
import {
  APPLICATION_SERVICE,
  ARTIFACT_MAX_SIZE_BYTES,
  ARTIFACT_PIPELINE,
  ARTIFACT_STORAGE,
  APPLICATION_UPLOAD_SERVICE,
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
  objectStorage?: ReadableObjectStoragePort,
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
        undefined,
        objectStorage,
        () => identity.listEmployeeIdsWithRole("application_reviewer"),
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
  storage: ReadableObjectStoragePort | undefined,
  maxSizeBytes: number,
): Provider[] {
  if (storage === undefined) return [];
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
    {
      provide: APPLICATION_UPLOAD_SERVICE,
      useFactory: (
        repository: KyselyApplicationRepository,
        resolvedStorage: ReadableObjectStoragePort,
        resolvedPipeline: ArtifactPipeline,
      ) =>
        new ApplicationUploadService(
          repository,
          resolvedStorage,
          resolvedPipeline,
        ),
      inject: [
        KyselyApplicationRepository,
        ARTIFACT_STORAGE,
        ARTIFACT_PIPELINE,
      ],
    },
  ];
}

function createUploadControllers(
  storage: ReadableObjectStoragePort | undefined,
): (
  | typeof ArtifactUploadController
  | typeof UnifiedUploadController
  | typeof PortalApplicationUploadController
  | typeof PortalApplicationAssetController
)[] {
  return storage === undefined
    ? []
    : [
        ArtifactUploadController,
        UnifiedUploadController,
        PortalApplicationUploadController,
        PortalApplicationAssetController,
      ];
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
    // 存储实例只创建一次：上传链路（统一上传）与小程序二维码校验（读取资产
    // buffer）共用；未装配存储时两者均不可用（fail-closed）。
    const storage =
      storageDirectory === undefined && artifactStorage === undefined
        ? undefined
        : (artifactStorage ??
          new DiskObjectStorage(storageDirectory as string));
    return {
      module: ApplicationModule,
      imports: [
        IdentityModule.register(database),
        NotificationModule.register(database),
      ],
      controllers: [ApplicationController, ...createUploadControllers(storage)],
      providers: [
        createRepositoryProvider(database),
        createApplicationServiceProvider(
          database,
          artifactVerifier,
          webTargetPolicy,
          storage,
        ),
        ...createUploadProviders(
          artifactVerifier,
          storage,
          artifactMaxSizeBytes,
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
    const storage =
      storageDirectory === undefined
        ? undefined
        : new DiskObjectStorage(storageDirectory);
    return {
      module: ApplicationModule,
      controllers: [ApplicationController, ...createUploadControllers(storage)],
      providers: [
        { provide: APPLICATION_SERVICE, useValue: application },
        { provide: IdentityService, useValue: identity },
        { provide: "ARTIFACT_VERIFIER", useValue: artifactVerifier },
        ...createUploadProviders(artifactVerifier, storage, 64 * 1024 * 1024),
      ],
      exports: [APPLICATION_SERVICE],
    };
  }
}
