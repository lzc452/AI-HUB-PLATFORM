import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { NotificationController } from "./notification.controller.js";
import { KyselyNotificationRepository } from "./notification.repository.js";
import type { DingTalkNotificationPort } from "./dingtalk.port.js";
import { NotificationService } from "./notification.service.js";
import { DingTalkNotificationMatrixService } from "./dingtalk-matrix.service.js";
import {
  DINGTALK_NOTIFICATION_MATRIX_SERVICE,
  NOTIFICATION_SERVICE,
} from "./notification.tokens.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";

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
              new AnalyticsEventService(
                new KyselyAnalyticsEventRepository(createDatabase(databaseUrl)),
              ),
            ),
          inject: [IdentityService],
        },
        {
          provide: DINGTALK_NOTIFICATION_MATRIX_SERVICE,
          useFactory: (
            notifications: NotificationService,
            identity: IdentityService,
          ) =>
            new DingTalkNotificationMatrixService(
              notifications,
              async (employeeId, role) => {
                const records = await identity.listEmployeeRoles(employeeId);
                const aliases: Record<string, readonly string[]> = {
                  application_reviewer: ["application_reviewer"],
                  application_owner: ["application_owner"],
                  demand_owner: ["demand_owner", "demand_operator"],
                  demand_submitter: ["employee", "demand_operator"],
                  demand_collaborator: [
                    "demand_collaborator",
                    "demand_operator",
                  ],
                  export_requester: [
                    "analytics_exporter",
                    "analytics_operator",
                    "super_admin",
                  ],
                  assistant_requester: [
                    "analytics_assistant_user",
                    "analytics_operator",
                    "super_admin",
                  ],
                };
                return records.some((record) =>
                  (aliases[role] ?? [role]).includes(record.roleCode),
                );
              },
            ),
          inject: [NOTIFICATION_SERVICE, IdentityService],
        },
      ],
      exports: [NOTIFICATION_SERVICE, DINGTALK_NOTIFICATION_MATRIX_SERVICE],
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
        {
          provide: DINGTALK_NOTIFICATION_MATRIX_SERVICE,
          useFactory: () =>
            new DingTalkNotificationMatrixService(notifications),
        },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [NOTIFICATION_SERVICE, DINGTALK_NOTIFICATION_MATRIX_SERVICE],
    };
  }
}
