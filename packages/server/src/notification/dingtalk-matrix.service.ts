import type { ActorContext } from "@ai-hub/contracts";
import type { NotificationService } from "./notification.service.js";

export const DINGTALK_NOTIFICATION_MATRIX = {
  "application.review.requested": {
    recipientRole: "application_reviewer",
    messageTemplate: "应用 {aggregateId} 已提交评审，待领取。",
  },
  "application.review.decided": {
    recipientRole: "application_owner",
    messageTemplate: "应用 {aggregateId} 的评审结论：{decision}。",
  },
  "application.review.claim_expired": {
    recipientRole: "application_reviewer",
    messageTemplate: "评审任务 {aggregateId} 已超时释放。",
  },
  "application.review.sla.reminder": {
    recipientRole: "application_reviewer",
    messageTemplate: "评审任务 {aggregateId} 将于 24 小时内到期，请及时处理。",
  },
  "application.review.sla.overdue": {
    recipientRole: "application_admin",
    messageTemplate:
      "评审任务 {aggregateId} 已超过 SLA（2 个工作日），请处理。",
  },
  "application.published": {
    recipientRole: "application_owner",
    messageTemplate: "应用 {aggregateId} 已发布。",
  },
  "application.withdrawn": {
    recipientRole: "application_owner",
    messageTemplate: "应用 {aggregateId} 已撤回。",
  },
  "application.withdraw.requested": {
    recipientRole: "application_owner",
    messageTemplate: "应用 {aggregateId} 已被申请下架：{reason}。",
  },
  "demand.submitted": {
    recipientRole: "demand_operator",
    messageTemplate: "需求 {aggregateId} 已提交。",
  },
  "demand.reviewed": {
    recipientRole: "demand_submitter",
    messageTemplate: "需求 {aggregateId} 的审核结论：{decision}。",
  },
  "demand.claimed": {
    recipientRole: "demand_submitter",
    messageTemplate: "需求 {aggregateId} 已被交付团队认领。",
  },
  "demand.collaborator_assigned": {
    recipientRole: "demand_collaborator",
    messageTemplate: "你已被分配至需求 {aggregateId}。",
  },
  "demand.progress_updated": {
    recipientRole: "demand_submitter",
    messageTemplate: "需求 {aggregateId} 的进度已更新为 {status}。",
  },
  "demand.pilot_started": {
    recipientRole: "demand_submitter",
    messageTemplate: "需求 {aggregateId} 的试点已启动。",
  },
  "demand.closed": {
    recipientRole: "demand_submitter",
    messageTemplate: "需求 {aggregateId} 已关闭。",
  },
  "demand.merged": {
    recipientRole: "demand_submitter",
    messageTemplate: "需求 {aggregateId} 已合并。",
  },
  "artifact.verification.failed": {
    recipientRole: "artifact_uploader",
    messageTemplate: "安装包 {aggregateId} 校验失败：{errorCode}。",
  },
  "analytics.export.completed": {
    recipientRole: "export_requester",
    messageTemplate: "分析导出 {aggregateId} 已就绪（{target}）。",
  },
  "analytics.export.failed": {
    recipientRole: "export_requester",
    messageTemplate: "分析导出 {aggregateId} 失败，已安全处理。",
  },
  "analytics.assistant.failed": {
    recipientRole: "assistant_requester",
    messageTemplate: "外部助手请求 {aggregateId} 当前不可用。",
  },
  "interaction.report.resolved": {
    recipientRole: "report_author",
    messageTemplate: "你对应用 {aggregateId} 的举报已处理。",
  },
} as const;

export type DingTalkNotificationScenario =
  keyof typeof DINGTALK_NOTIFICATION_MATRIX;

type TemplateValue = string | number;

export interface DingTalkNotificationQueueInput {
  recipientEmployeeId: string;
  aggregateId: string;
  variables?: Readonly<Record<string, TemplateValue>>;
}

export type DingTalkRecipientAuthorizer = (
  recipientEmployeeId: string,
  recipientRole: string,
  aggregateId: string,
  actor: ActorContext,
) => Promise<boolean>;

const FORBIDDEN_VARIABLES = new Set([
  "employeeNumber",
  "internalUrl",
  "file",
  "qrCode",
  "anonymousIdentity",
]);

export class DingTalkNotificationMatrixService {
  public constructor(
    private readonly notifications: Pick<NotificationService, "createForEvent">,
    private readonly authorizeRecipient: DingTalkRecipientAuthorizer,
  ) {}

  public async queue(
    actor: ActorContext,
    scenario: DingTalkNotificationScenario,
    input: DingTalkNotificationQueueInput,
  ) {
    if (input.recipientEmployeeId.trim().length === 0) {
      throw new Error("NOTIFICATION_RECIPIENT_REQUIRED");
    }
    const variables = input.variables ?? {};
    for (const key of Object.keys(variables)) {
      if (FORBIDDEN_VARIABLES.has(key)) {
        throw new Error("NOTIFICATION_TEMPLATE_VARIABLE_FORBIDDEN");
      }
    }
    const entry = DINGTALK_NOTIFICATION_MATRIX[scenario];
    if (
      !(await this.authorizeRecipient(
        input.recipientEmployeeId,
        entry.recipientRole,
        input.aggregateId,
        actor,
      ))
    ) {
      throw new Error("NOTIFICATION_RECIPIENT_NOT_AUTHORIZED");
    }
    const message = entry.messageTemplate.replace(
      /\{([a-zA-Z]+)\}/gu,
      (placeholder, key: string) => {
        if (key === "aggregateId") return input.aggregateId;
        return String(variables[key] ?? placeholder);
      },
    );
    return this.notifications.createForEvent(actor, {
      recipientEmployeeId: input.recipientEmployeeId,
      eventType: scenario,
      aggregateId: input.aggregateId,
      message,
      metadata: {
        notificationScenario: scenario,
        recipientRole: entry.recipientRole,
        actorEmployeeId: actor.employeeId,
      },
    });
  }
}
