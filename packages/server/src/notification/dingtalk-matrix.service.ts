import type { ActorContext } from "@ai-hub/contracts";
import type { NotificationService } from "./notification.service.js";

export const DINGTALK_NOTIFICATION_MATRIX = {
  "application.review_requested": {
    recipientRole: "application_reviewer",
    messageTemplate: "应用 {aggregateId} 已提交评审。",
  },
  "application.review_decided": {
    recipientRole: "application_owner",
    messageTemplate: "应用 {aggregateId} 的评审结论：{decision}。",
  },
  "application.published": {
    recipientRole: "application_owner",
    messageTemplate: "应用 {aggregateId} 已发布。",
  },
  "application.withdrawn": {
    recipientRole: "application_owner",
    messageTemplate: "应用 {aggregateId} 已撤回。",
  },
  "demand.submitted": {
    recipientRole: "demand_owner",
    messageTemplate: "需求 {aggregateId} 已提交。",
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
