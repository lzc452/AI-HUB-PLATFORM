import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { APPLICATION_SERVICE } from "../application/application.tokens.js";
import { ApplicationModule } from "../application/application.module.js";
import type { ApplicationService } from "../application/application.service.js";
import { DiskObjectStorage } from "../application/storage.disk.js";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { DemandController } from "./demand.controller.js";
import { KyselyDemandRepository } from "./demand.repository.js";
import { DemandService } from "./demand.service.js";
import { DEMAND_SERVICE, DEMAND_STORAGE } from "./demand.tokens.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";
import { NotificationModule } from "../notification/notification.module.js";
import { DINGTALK_NOTIFICATION_MATRIX_SERVICE } from "../notification/notification.tokens.js";
import type { DingTalkNotificationMatrixService } from "../notification/dingtalk-matrix.service.js";

@Module({})
export class DemandModule {
  static register(
    database: Kysely<DatabaseSchema>,
    storageDirectory?: string,
  ): DynamicModule {
    return {
      module: DemandModule,
      imports: [
        IdentityModule.register(database),
        ApplicationModule.registerService(database),
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
