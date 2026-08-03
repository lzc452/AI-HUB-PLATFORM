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

async function authorizeDingTalkResource(
  databaseUrl: string,
  role: string,
  aggregateId: string,
  recipientEmployeeId: string,
  actor: { employeeId: string; sessionId: string },
): Promise<boolean> {
  const database = createDatabase(databaseUrl);
  try {
    switch (role) {
      case "application_reviewer":
        return (
          (await database
            .selectFrom("application_review_queue")
            .select("review_queue_id")
            .where("application_id", "=", aggregateId)
            .executeTakeFirst()) !== undefined
        );
      case "application_owner":
        return (
          (await database
            .selectFrom("applications")
            .select("application_id")
            .where("application_id", "=", aggregateId)
            .where("owner_employee_id", "=", recipientEmployeeId)
            .executeTakeFirst()) !== undefined
        );
      case "demand_submitter":
        return (
          (await database
            .selectFrom("ai_demands")
            .select("demand_id")
            .where("demand_id", "=", aggregateId)
            .where("requester_employee_id", "=", recipientEmployeeId)
            .executeTakeFirst()) !== undefined
        );
      case "demand_owner":
        return (
          (await database
            .selectFrom("ai_demands")
            .select("demand_id")
            .where("demand_id", "=", aggregateId)
            .where("owner_employee_id", "=", recipientEmployeeId)
            .executeTakeFirst()) !== undefined
        );
      case "demand_collaborator":
        return (
          (await database
            .selectFrom("ai_demand_collaborators")
            .select("demand_id")
            .where("demand_id", "=", aggregateId)
            .where("employee_id", "=", recipientEmployeeId)
            .where("role", "=", "collaborator")
            .executeTakeFirst()) !== undefined
        );
      case "export_requester":
        return (
          (await database
            .selectFrom("analytics_export_jobs")
            .select("export_id")
            .where("export_id", "=", aggregateId)
            .where("requested_by_employee_id", "=", recipientEmployeeId)
            .executeTakeFirst()) !== undefined
        );
      case "assistant_requester":
        return (
          recipientEmployeeId === actor.employeeId &&
          aggregateId === actor.sessionId
        );
      default:
        return false;
    }
  } finally {
    await database.destroy();
  }
}

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
              async (employeeId, role, aggregateId, actor) => {
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
                const hasRole = records.some((record) =>
                  (aliases[role] ?? [role]).includes(record.roleCode),
                );
                return (
                  hasRole &&
                  (await authorizeDingTalkResource(
                    databaseUrl,
                    role,
                    aggregateId,
                    employeeId,
                    actor,
                  ))
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
            new DingTalkNotificationMatrixService(
              notifications,
              async () => true,
            ),
        },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [NOTIFICATION_SERVICE, DINGTALK_NOTIFICATION_MATRIX_SERVICE],
    };
  }
}
