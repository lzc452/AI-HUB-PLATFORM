import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { ApplicationController } from "./application.controller.js";
import { ArtifactUploadController } from "./artifact-upload.controller.js";
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
import type { ArtifactVerificationPort } from "./storage.port.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";

const unavailableArtifactVerifier: ArtifactVerificationPort = {
  async verifyArtifact() {
    throw new Error("ARTIFACT_VERIFIER_UNAVAILABLE");
  },
};

/** V1 单请求 raw body 上限；与运行时配置默认值保持一致。 */
const DEFAULT_ARTIFACT_MAX_SIZE_BYTES = 64 * 1024 * 1024;

function createRepositoryProvider(databaseUrl: string): Provider {
  return {
    provide: KyselyApplicationRepository,
    useFactory: () =>
      new KyselyApplicationRepository(createDatabase(databaseUrl)),
  };
}

function createApplicationServiceProvider(
  databaseUrl: string,
  artifactVerifier: ArtifactVerificationPort,
) {
  const analyticsEvents = new AnalyticsEventService(
    new KyselyAnalyticsEventRepository(createDatabase(databaseUrl)),
  );

  return {
    provide: APPLICATION_SERVICE,
    useFactory: (
      repository: KyselyApplicationRepository,
      identity: IdentityService,
    ) =>
      new ApplicationService(
        repository,
        identity,
        artifactVerifier,
        analyticsEvents,
      ),
    inject: [KyselyApplicationRepository, IdentityService],
  };
}

function createUploadProviders(
  artifactVerifier: ArtifactVerificationPort,
  storageDirectory: string | undefined,
  maxSizeBytes: number,
): Provider[] {
  if (storageDirectory === undefined) return [];
  const storage = new DiskObjectStorage(storageDirectory);
  const pipeline =
    artifactVerifier instanceof ArtifactPipeline
      ? artifactVerifier
      : new ArtifactPipeline(storage, {
          scan: () => Promise.reject(new Error("ARTIFACT_SECURITY_UNAVAILABLE")),
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
): (typeof ArtifactUploadController)[] {
  return storageDirectory === undefined ? [] : [ArtifactUploadController];
}

@Module({})
export class ApplicationModule {
  static registerService(
    databaseUrl: string,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
  ): DynamicModule {
    return {
      module: ApplicationModule,
      imports: [IdentityModule.register(databaseUrl)],
      providers: [
        createRepositoryProvider(databaseUrl),
        createApplicationServiceProvider(databaseUrl, artifactVerifier),
      ],
      exports: [APPLICATION_SERVICE],
    };
  }

  static register(
    databaseUrl: string,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
    storageDirectory?: string,
    artifactMaxSizeBytes: number = DEFAULT_ARTIFACT_MAX_SIZE_BYTES,
  ): DynamicModule {
    return {
      module: ApplicationModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [
        ApplicationController,
        ...createUploadControllers(storageDirectory),
      ],
      providers: [
        createRepositoryProvider(databaseUrl),
        createApplicationServiceProvider(databaseUrl, artifactVerifier),
        ...createUploadProviders(
          artifactVerifier,
          storageDirectory,
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
