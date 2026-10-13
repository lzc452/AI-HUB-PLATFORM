import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { APPLICATION_SERVICE } from "../application/application.tokens.js";
import { ApplicationModule } from "../application/application.module.js";
import type { ApplicationService } from "../application/application.service.js";
import { DiskObjectStorage } from "../application/storage.disk.js";
import { ArtifactPipeline } from "../application/storage.pipeline.js";
import type {
  ArtifactVerificationPort,
  ObjectStoragePort as ReadableObjectStoragePort,
} from "../application/storage.port.js";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { DemandController } from "./demand.controller.js";
import { KyselyDemandRepository } from "./demand.repository.js";
import { DemandService } from "./demand.service.js";
import {
  DEMAND_ATTACHMENT_PIPELINE,
  DEMAND_SERVICE,
  DEMAND_STORAGE,
} from "./demand.tokens.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";
import { NotificationModule } from "../notification/notification.module.js";
import { DINGTALK_NOTIFICATION_MATRIX_SERVICE } from "../notification/notification.tokens.js";
import type { DingTalkNotificationMatrixService } from "../notification/dingtalk-matrix.service.js";

/**
 * 附件扫描管线的存储占位实现。
 *
 * 扫描发生在落盘**之前**（见 DemandController.uploadAttachment），
 * 因此这个对象在扫描路径上永远不会被读写。它的作用只是满足
 * ArtifactPipeline 的构造签名，同时避免在没有配置存储目录的环境里
 * 触发真实存储的构造副作用（如 mkdirSync("") 抛错）。
 *
 * 任何被调用的方法都抛错——「不可用」必须表现为失败，
 * 而不是一个悄悄返回成功的空实现。
 */
class UnavailableObjectStorage implements ReadableObjectStoragePort {
  async put(): Promise<void> {
    throw new Error("DEMAND_STORAGE_UNAVAILABLE");
  }
  async get(): Promise<Uint8Array | null> {
    throw new Error("DEMAND_STORAGE_UNAVAILABLE");
  }
  async copy(): Promise<void> {
    throw new Error("DEMAND_STORAGE_UNAVAILABLE");
  }
  async delete(): Promise<void> {
    throw new Error("DEMAND_STORAGE_UNAVAILABLE");
  }
  async openReadStream(): Promise<NodeJS.ReadableStream | null> {
    throw new Error("DEMAND_STORAGE_UNAVAILABLE");
  }
  async putStream(): Promise<number> {
    throw new Error("DEMAND_STORAGE_UNAVAILABLE");
  }
}

@Module({})
export class DemandModule {
  static register(
    database: Kysely<DatabaseSchema>,
    storageDirectory?: string,
    applicationModule?: DynamicModule,
    artifactVerification?: ArtifactVerificationPort,
    artifactStorage?: ReadableObjectStoragePort,
  ): DynamicModule {
    return {
      module: DemandModule,
      imports: [
        IdentityModule.register(database),
        applicationModule ?? ApplicationModule.registerService(database),
        NotificationModule.register(database),
      ],
      controllers: [DemandController],
      providers: [
        {
          provide: DEMAND_SERVICE,
          useFactory: (
            identity: IdentityService,
            applications: ApplicationService,
            notifications: DingTalkNotificationMatrixService,
          ) =>
            new DemandService(
              new KyselyDemandRepository(database),
              identity,
              applications,
              new AnalyticsEventService(
                new KyselyAnalyticsEventRepository(database),
              ),
              identity,
              notifications,
            ),
          inject: [
            IdentityService,
            APPLICATION_SERVICE,
            DINGTALK_NOTIFICATION_MATRIX_SERVICE,
          ],
        },
        ...(storageDirectory === undefined
          ? []
          : [
              {
                provide: DEMAND_STORAGE,
                useValue: new DiskObjectStorage(storageDirectory),
              },
            ]),
        // 附件扫描门禁。**未装配真实扫描器时必须 fail-closed**：
        // 拿一个 scan恒抛错的 pipeline，附件上传会被拒绝而不是被放行。
        // 这正是修复前的行为——控制器压根没有扫描器，EICAR 直接入库。
        {
          provide: DEMAND_ATTACHMENT_PIPELINE,
          useFactory: (): ArtifactPipeline => {
            //扫描在落盘之前发生（见控制器），因此这里的 storage 只是
            // pipeline 的依赖占位，scanContent 不会触碰它。
            // 不能用 DiskObjectStorage 兜底：storageDirectory 为空时
            // mkdirSync("") 会抛错，把「未配存储」变成「模块启动失败」。
            const storage = artifactStorage ?? new UnavailableObjectStorage();
            return artifactVerification instanceof ArtifactPipeline
              ? artifactVerification
              : new ArtifactPipeline(storage, {
                  scan: () =>
                    Promise.reject(new Error("ARTIFACT_SECURITY_UNAVAILABLE")),
                  verify: () =>
                    Promise.reject(new Error("ARTIFACT_SECURITY_UNAVAILABLE")),
                });
          },
          inject: [],
        },
      ],
      exports: [DEMAND_SERVICE],
    };
  }

  static forTest(
    demands: DemandService,
    identity: IdentityService,
    applications?: ApplicationService,
  ): DynamicModule {
    return {
      module: DemandModule,
      controllers: [DemandController],
      providers: [
        { provide: DEMAND_SERVICE, useValue: demands },
        { provide: IdentityService, useValue: identity },
        ...(applications === undefined
          ? []
          : [{ provide: APPLICATION_SERVICE, useValue: applications }]),
      ],
      exports: [DEMAND_SERVICE],
    };
  }
}
