import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { PERMISSIONS } from "@ai-hub/contracts";
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

/**
 * 矩阵 `recipientRole` → 判定该收件人所需的有效权限码。
 *
 * 只覆盖**能力型**收件人（其资格由角色权限决定）。归属型收件人
 * （owner / submitter / collaborator / requester / uploader / author）
 * 的资格由「他与该资源的关系」决定，不看权限——普通员工提交的申请，
 * 结论必须通知到本人，而 `employee` 角色并不持有 application.review。
 * 这类角色在此登记为 `undefined`，由资源层单独判定。
 */
const RECIPIENT_ROLE_PERMISSION: Readonly<Record<string, string | undefined>> =
  Object.freeze({
    application_reviewer: PERMISSIONS.APPLICATION_REVIEW,
    application_admin: PERMISSIONS.APPLICATION_MANAGE,
    demand_operator: PERMISSIONS.DEMAND_REVIEW,
  });

/**
 * 判断收件人当前是否**有效持有**某项能力。
 *
 * 三个条件缺一不可：
 * 1. 员工 `status = 'active'`：停用员工登录不进来，不该收到任何通知；
 * 2. 角色 `status = 'active'`：角色被停用后不解绑仍然保留在 employee_roles 里，
 *    若不过滤，等于把权限授予一个已经撤销的角色；
 * 3. `permissions @> '["<code>"]'` 或 `permissions @> '["*"]'`：通配符必须一起匹配，
 *    否则超级管理员会被静默排除在审核广播之外（其 permissions 恰是 `["*"]`）。
 *
 * 条件全部下推到 SQL——roles.permissions 上有 GIN 索引，
 * 且避免把全部角色成员捞进应用层再做 some()。
 */
async function hasEffectivePermission(
  database: Kysely<DatabaseSchema>,
  employeeId: string,
  recipientRole: string,
): Promise<boolean> {
  const permission = RECIPIENT_ROLE_PERMISSION[recipientRole];
  // 归属型收件人：资格完全交给资源层判定。
  if (permission === undefined) return true;
  // roles.permissions 在 schema 中声明为 readonly string[]，
  // 因此必须用带类型的 sql<T> 表达式（而不是裸 sql 模板）才能过 ValueExpression；
  // 同时 ::jsonb 转换保证 PG 侧的 jsonb 比较语义正确。
  const matches = sql<
    readonly string[]
  >`${JSON.stringify([permission])}::jsonb`;
  const wildcard = sql<readonly string[]>`${JSON.stringify(["*"])}::jsonb`;
  const row = await database
    .selectFrom("employee_roles")
    .innerJoin("roles", "roles.role_code", "employee_roles.role_code")
    .innerJoin(
      "employees",
      "employees.employee_id",
      "employee_roles.employee_id",
    )
    .select("employee_roles.employee_id")
    .where("employee_roles.employee_id", "=", employeeId)
    .where("roles.status", "=", "active")
    .where("employees.status", "=", "active")
    .where((expression) =>
      expression.or([
        expression("roles.permissions", "@>", matches),
        expression("roles.permissions", "@>", wildcard),
      ]),
    )
    .executeTakeFirst();
  return row !== undefined;
}

async function authorizeDingTalkResource(
  database: Kysely<DatabaseSchema>,
  role: string,
  aggregateId: string,
  recipientEmployeeId: string,
  actor: { employeeId: string; sessionId: string },
): Promise<boolean> {
  switch (role) {
    case "application_reviewer":
      return (
        (await database
          .selectFrom("application_review_queue")
          .select("review_queue_id")
          .where("application_id", "=", aggregateId)
          .executeTakeFirst()) !== undefined
      );
    // SLA 超时通知的收件人是应用管理员，而非领取人。
    // 缺这个case 会落到 default:false，导致超期告警永远发不出去——
    // 恰恰是最该被送达的那一类通知。
    case "application_admin":
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
    case "demand_operator":
      return (
        (await database
          .selectFrom("ai_demands")
          .select("demand_id")
          .where("demand_id", "=", aggregateId)
          .executeTakeFirst()) !== undefined
      );
    case "demand_collaborator":
      // 协作者角色含 collaborator/operator（DemandCollaboratorRole），
      // 两者都是"被分配至需求"的成员，均应能收到协作类通知。
      return (
        (await database
          .selectFrom("ai_demand_collaborators")
          .select("demand_id")
          .where("demand_id", "=", aggregateId)
          .where("employee_id", "=", recipientEmployeeId)
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
    case "report_author":
      return (
        (await database
          .selectFrom("application_reports")
          .select("report_id")
          .where("application_id", "=", aggregateId)
          .where("reporter_employee_id", "=", recipientEmployeeId)
          .executeTakeFirst()) !== undefined
      );
    case "artifact_uploader":
      return (
        (await database
          .selectFrom("application_artifact_uploads")
          .select("upload_id")
          .where("application_id", "=", aggregateId)
          .where("uploaded_by_employee_id", "=", recipientEmployeeId)
          .executeTakeFirst()) !== undefined
      );
    default:
      return false;
  }
}

@Module({})
export class NotificationModule {
  static register(
    database: Kysely<DatabaseSchema>,
    dingtalk: DingTalkNotificationPort = unavailableDingTalk,
  ): DynamicModule {
    return {
      module: NotificationModule,
      imports: [IdentityModule.register(database)],
      controllers: [NotificationController],
      providers: [
        {
          provide: NOTIFICATION_SERVICE,
          useFactory: (identity: IdentityService) =>
            new NotificationService(
              new KyselyNotificationRepository(database),
              identity,
              dingtalk,
              new AnalyticsEventService(
                new KyselyAnalyticsEventRepository(database),
              ),
            ),
          inject: [IdentityService],
        },
        {
          provide: DINGTALK_NOTIFICATION_MATRIX_SERVICE,
          useFactory: (notifications: NotificationService) =>
            new DingTalkNotificationMatrixService(
              notifications,
              async (employeeId, role, aggregateId, actor) => {
                // 第一层：权限码。角色码是部署时才能确定的运维产物，
                // 而通知授权要回答的是「这个人现在能不能做这件事」——
                // 后者由权限码唯一确定。历史上这里写的是硬编码角色码
                // （application_reviewer / application_owner…），
                // 但 application_reviewer 从未出现在 SYSTEM_ROLE_DEFINITIONS 里，
                // 于是任何真实环境的审核通知都会被全量拒绝。
                // 测试之所以长期发现不了：只有一处单测 mock 了这个不存在的角色码。
                const authorizedByPermission = await hasEffectivePermission(
                  database,
                  employeeId,
                  role,
                );
                // 第二层：资源归属。即使持有权限，通知也只能发到与该资源有关的人。
                return (
                  authorizedByPermission &&
                  (await authorizeDingTalkResource(
                    database,
                    role,
                    aggregateId,
                    employeeId,
                    actor,
                  ))
                );
              },
            ),
          inject: [NOTIFICATION_SERVICE],
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
