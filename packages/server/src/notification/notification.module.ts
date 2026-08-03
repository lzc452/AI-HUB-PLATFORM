import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { NotificationController } from "./notification.controller.js";
import { KyselyNotificationRepository } from "./notification.repository.js";
import type { DingTalkNotificationPort } from "./dingtalk.port.js";
import { NotificationService } from "./notification.service.js";
import { NOTIFICATION_SERVICE } from "./notification.tokens.js";

const unavailableDingTalk: DingTalkNotificationPort = {
  async send() {
    return { delivered: false, errorCode: "DINGTALK_UNAVAILABLE" };
  },
};

@Module({})
export class NotificationModule {
  static register(
    databaseUrl: string,
    dingtalk: DingTalkNotificationPort = unavailableDingTalk,
  ): DynamicModule {
    return {
      module: NotificationModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [NotificationController],
      providers: [
        {
          provide: NOTIFICATION_SERVICE,
          useFactory: (identity: IdentityService) =>
            new NotificationService(
              new KyselyNotificationRepository(createDatabase(databaseUrl)),
              identity,
              dingtalk,
            ),
          inject: [IdentityService],
        },
      ],
      exports: [NOTIFICATION_SERVICE],
    };
  }

  static forTest(
    notifications: NotificationService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: NotificationModule,
      controllers: [NotificationController],
      providers: [
        { provide: NOTIFICATION_SERVICE, useValue: notifications },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [NOTIFICATION_SERVICE],
    };
  }
}
