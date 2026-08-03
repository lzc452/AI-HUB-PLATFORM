import type { ActorContext } from "@ai-hub/contracts";
import type { NotificationService } from "./notification.service.js";

export const DINGTALK_NOTIFICATION_MATRIX = {
  "application.review_requested": {
    recipientRole: "application_reviewer",
    messageTemplate: "Application {aggregateId} is ready for review.",
  },
  "application.review_decided": {
    recipientRole: "application_owner",
    messageTemplate: "Application {aggregateId} review decision: {decision}.",
  },
  "application.published": {
    recipientRole: "application_owner",
    messageTemplate: "Application {aggregateId} is published.",
  },
  "application.withdrawn": {
    recipientRole: "application_owner",
    messageTemplate: "Application {aggregateId} is withdrawn.",
  },
  "demand.submitted": {
    recipientRole: "demand_owner",
    messageTemplate: "Demand {aggregateId} was submitted.",
  },
  "demand.claimed": {
    recipientRole: "demand_submitter",
    messageTemplate: "Demand {aggregateId} was claimed by a delivery team.",
  },
  "demand.collaborator_assigned": {
    recipientRole: "demand_collaborator",
    messageTemplate: "You were assigned to demand {aggregateId}.",
  },
  "demand.progress_updated": {
    recipientRole: "demand_submitter",
    messageTemplate: "Demand {aggregateId} progress changed to {status}.",
  },
  "demand.pilot_started": {
    recipientRole: "demand_submitter",
    messageTemplate: "Demand {aggregateId} pilot started.",
  },
  "demand.closed": {
    recipientRole: "demand_submitter",
    messageTemplate: "Demand {aggregateId} was closed.",
  },
  "demand.merged": {
    recipientRole: "demand_submitter",
    messageTemplate: "Demand {aggregateId} was merged.",
  },
  "analytics.export.completed": {
    recipientRole: "export_requester",
    messageTemplate: "Analytics export {aggregateId} is ready ({target}).",
  },
  "analytics.export.failed": {
    recipientRole: "export_requester",
    messageTemplate: "Analytics export {aggregateId} failed safely.",
  },
  "analytics.assistant.failed": {
    recipientRole: "assistant_requester",
    messageTemplate: "External assistant request {aggregateId} is unavailable.",
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
