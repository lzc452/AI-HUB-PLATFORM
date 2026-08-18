import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { InteractionController } from "./interaction.controller.js";
import { KyselyInteractionRepository } from "./interaction.repository.js";
import { InteractionService } from "./interaction.service.js";
import { INTERACTION_SERVICE } from "./interaction.tokens.js";
import { CatalogVisibilityPolicy } from "../catalog/catalog-visibility.policy.js";
import { KyselyCatalogRepository } from "../catalog/catalog.repository.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";
import { NotificationModule } from "../notification/notification.module.js";
import { DINGTALK_NOTIFICATION_MATRIX_SERVICE } from "../notification/notification.tokens.js";
import type { DingTalkNotificationMatrixService } from "../notification/dingtalk-matrix.service.js";

@Module({})
export class InteractionModule {
  static register(database: Kysely<DatabaseSchema>): DynamicModule {
    const analyticsEvents = new AnalyticsEventService(
      new KyselyAnalyticsEventRepository(database),
    );
    return {
      module: InteractionModule,
      imports: [
        IdentityModule.register(database),
        NotificationModule.register(database),
      ],
      controllers: [InteractionController],
      providers: [
        {
          provide: INTERACTION_SERVICE,
          useFactory: (
            identity: IdentityService,
            notifications: DingTalkNotificationMatrixService,
          ) =>
            new InteractionService(
              new KyselyInteractionRepository(database),
              identity,
              new CatalogVisibilityPolicy(
                new KyselyCatalogRepository(database),
              ),
              analyticsEvents,
              notifications,
            ),
          inject: [IdentityService, DINGTALK_NOTIFICATION_MATRIX_SERVICE],
        },
      ],
      exports: [INTERACTION_SERVICE],
    };
  }

  static forTest(
    interactions: InteractionService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: InteractionModule,
      controllers: [InteractionController],
      providers: [
        { provide: INTERACTION_SERVICE, useValue: interactions },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [INTERACTION_SERVICE],
    };
  }
}
