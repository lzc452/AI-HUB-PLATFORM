import type { Insertable } from "kysely";
import type { DatabaseSchema } from "../../schema.js";
import { IDS } from "../ids.js";
import { daysAgo } from "../time-utils.js";
import { demoIdempotency } from "../idempotency.js";
import { DEMO_ACCOUNT_DEFINITIONS } from "../../demo-seed.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const EMP = Object.freeze({
  employee: DEMO_ACCOUNT_DEFINITIONS[0]!.employeeId,
  appAdmin: DEMO_ACCOUNT_DEFINITIONS[1]!.employeeId,
  innovation: DEMO_ACCOUNT_DEFINITIONS[2]!.employeeId,
  orgAdmin: DEMO_ACCOUNT_DEFINITIONS[3]!.employeeId,
  superAdmin: DEMO_ACCOUNT_DEFINITIONS[4]!.employeeId,
});

type DeliveryStatus = Insertable<DatabaseSchema["notifications"]>["delivery_status"];

// ── notification plan (20: 覆盖全部权威通知类型，按 5 个角色分发) ─────────────
//
// 覆盖来源：
//   - DINGTALK_NOTIFICATION_MATRIX 的 14 个官方通知场景
//     (application.review_requested/review_decided/published/withdrawn,
//      demand.submitted/claimed/collaborator_assigned/progress_updated/
//      pilot_started/closed/merged,
//      analytics.export.completed/failed, analytics.assistant.failed)
//   - 系统级通知 3 个 (system.announcement/maintenance/audit_alert)
//   - 互动/安全类 3 个 (application.comment_replied/rating_added/reported)
// 共 20 个，正好用满 IDS.notification[0..19]。
//
// 每个角色收到的通知各不相同，且覆盖全部 4 种投递状态与已读/未读混合。

interface NotificationPlan {
  /** Index into IDS.notification[0..19] */
  notificationIdx: number;
  recipientEmployeeId: string;
  eventType: string;
  aggregateId: string;
  message: string;
  deliveryStatus: DeliveryStatus;
  isRead: boolean;
  deliveryAttempts: number;
  lastDeliveryError: string | null;
  daysOffset: number; // days ago from anchor for created_at
}

const NOTIFICATION_PLAN: readonly NotificationPlan[] = Object.freeze([
  // ── EMPLOYEE (4) ───────────────────────────────────────────────────────
  {
    notificationIdx: 0,
    recipientEmployeeId: EMP.employee,
    eventType: "application.review_decided",
    aggregateId: IDS.application.published[0]!,
    message: "您提交的应用「智能排班助手」评审已通过，可发布上线。",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 6,
  },
  {
    notificationIdx: 1,
    recipientEmployeeId: EMP.employee,
    eventType: "demand.submitted",
    aggregateId: IDS.demand.all[0]!,
    message: "您提交的需求「AI 辅助项目风险评估」已进入评审流程。",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 8,
  },
  {
    notificationIdx: 2,
    recipientEmployeeId: EMP.employee,
    eventType: "demand.progress_updated",
    aggregateId: IDS.demand.inProgress[0]!,
    message: "需求「AI 辅助项目风险评估」的进度已更新为进行中。",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 7,
  },
  {
    notificationIdx: 3,
    recipientEmployeeId: EMP.employee,
    eventType: "application.comment_replied",
    aggregateId: IDS.application.published[2]!,
    message: "有人回复了你在「薪酬查询报表」中的评论。",
    deliveryStatus: "sent",
    isRead: false,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 5,
  },

  // ── APP-ADMIN (3) ──────────────────────────────────────────────────────
  {
    notificationIdx: 4,
    recipientEmployeeId: EMP.appAdmin,
    eventType: "application.review_requested",
    aggregateId: IDS.application.inReview[0]!,
    message: "应用「智能排班助手」已提交评审，请尽快完成审核。",
    deliveryStatus: "pending",
    isRead: false,
    deliveryAttempts: 0,
    lastDeliveryError: null,
    daysOffset: 4,
  },
  {
    notificationIdx: 5,
    recipientEmployeeId: EMP.appAdmin,
    eventType: "system.announcement",
    aggregateId: IDS.department.company,
    message: "系统将于本周六凌晨 2:00-4:00 进行维护升级，请提前保存工作。",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 11,
  },
  {
    notificationIdx: 6,
    recipientEmployeeId: EMP.appAdmin,
    eventType: "application.reported",
    aggregateId: IDS.application.published[4]!,
    message: "应用「消息推送中心」收到举报，请及时处理。",
    deliveryStatus: "failed",
    isRead: false,
    deliveryAttempts: 3,
    lastDeliveryError: "DingTalk webhook timeout after 5000ms",
    daysOffset: 1,
  },

  // ── INNOVATION (4) ─────────────────────────────────────────────────────
  {
    notificationIdx: 7,
    recipientEmployeeId: EMP.innovation,
    eventType: "application.published",
    aggregateId: IDS.application.published[1]!,
    message: "「数据分析驾驶舱」已成功发布上线。",
    deliveryStatus: "sent",
    isRead: false,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 9,
  },
  {
    notificationIdx: 8,
    recipientEmployeeId: EMP.innovation,
    eventType: "demand.claimed",
    aggregateId: IDS.demand.all[1]!,
    message: "需求「多语言文档翻译与校对系统」已被交付团队认领。",
    deliveryStatus: "sent",
    isRead: false,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 5,
  },
  {
    notificationIdx: 9,
    recipientEmployeeId: EMP.innovation,
    eventType: "demand.collaborator_assigned",
    aggregateId: IDS.demand.all[2]!,
    message: "你已被分配至需求「智能合同审查助手」，请尽快介入。",
    deliveryStatus: "pending",
    isRead: false,
    deliveryAttempts: 0,
    lastDeliveryError: null,
    daysOffset: 2,
  },
  {
    notificationIdx: 10,
    recipientEmployeeId: EMP.innovation,
    eventType: "demand.pilot_started",
    aggregateId: IDS.demand.pilot[0]!,
    message: "需求「多语言文档翻译与校对系统」的试点已启动。",
    deliveryStatus: "sent",
    isRead: false,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 4,
  },

  // ── ORG-ADMIN (4) ──────────────────────────────────────────────────────
  {
    notificationIdx: 11,
    recipientEmployeeId: EMP.orgAdmin,
    eventType: "application.withdrawn",
    aggregateId: IDS.application.withdrawn[0]!,
    message: "应用「旧版报表工具」已被作者撤回。",
    deliveryStatus: "retry",
    isRead: false,
    deliveryAttempts: 2,
    lastDeliveryError: "Delivery failed due to network error",
    daysOffset: 3,
  },
  {
    notificationIdx: 12,
    recipientEmployeeId: EMP.orgAdmin,
    eventType: "demand.closed",
    aggregateId: IDS.demand.closed[0]!,
    message: "需求「历史数据归档治理」已关闭。",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 10,
  },
  {
    notificationIdx: 13,
    recipientEmployeeId: EMP.orgAdmin,
    eventType: "analytics.export.completed",
    aggregateId: IDS.analyticsExportJob[0]!,
    message: "分析导出 job-weekly-report 已就绪（weekly-report）。",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 5,
  },
  {
    notificationIdx: 14,
    recipientEmployeeId: EMP.orgAdmin,
    eventType: "system.maintenance",
    aggregateId: IDS.department.company,
    message: "例行安全扫描已完成，发现 2 个低风险项需关注。",
    deliveryStatus: "retry",
    isRead: false,
    deliveryAttempts: 2,
    lastDeliveryError: "Delivery failed due to network error",
    daysOffset: 2,
  },

  // ── SUPER-ADMIN (5) ────────────────────────────────────────────────────
  {
    notificationIdx: 15,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "demand.merged",
    aggregateId: IDS.demand.merged[0]!,
    message: "需求「智能会议纪要生成」已合并至主需求。",
    deliveryStatus: "sent",
    isRead: false,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 6,
  },
  {
    notificationIdx: 16,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "analytics.export.failed",
    aggregateId: IDS.analyticsExportJob[1]!,
    message: "分析导出 job-risk-dashboard 失败，已安全处理。",
    deliveryStatus: "failed",
    isRead: false,
    deliveryAttempts: 3,
    lastDeliveryError: "Export job crashed: out of memory",
    daysOffset: 3,
  },
  {
    notificationIdx: 17,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "analytics.assistant.failed",
    aggregateId: IDS.analyticsExportJob[2]!,
    message: "外部助手请求 assistant-risk-copilot 当前不可用。",
    deliveryStatus: "retry",
    isRead: false,
    deliveryAttempts: 2,
    lastDeliveryError: "Upstream assistant timeout after 10000ms",
    daysOffset: 1,
  },
  {
    notificationIdx: 18,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "system.audit_alert",
    aggregateId: IDS.department.company,
    message: "检测到异常登录行为，来源 IP: 192.168.1.100。",
    deliveryStatus: "failed",
    isRead: true,
    deliveryAttempts: 3,
    lastDeliveryError: "DingTalk API returned 500 Internal Server Error",
    daysOffset: 4,
  },
  {
    notificationIdx: 19,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "application.rating_added",
    aggregateId: IDS.application.published[3]!,
    message: "应用「安全策略配置」收到了新的评分（5 星）。",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 7,
  },
]);

// ── fixture data type ────────────────────────────────────────────────────────

export interface NotificationFixtureData {
  notifications: Array<Insertable<DatabaseSchema["notifications"]>>;
}

// ── implementation ──────────────────────────────────────────────────────────

/**
 * Build the notification fixture.
 *
 * Produces 20 notifications covering:
 * - All 14 official notification scenarios (DINGTALK_NOTIFICATION_MATRIX)
 * - 3 system notifications (announcement / maintenance / audit_alert)
 * - 3 interaction/security notifications (comment_replied / rating_added / reported)
 * - Distributed across the 5 demo accounts (each role gets a distinct set)
 * - All 4 delivery statuses: pending(2), sent(12), retry(3), failed(3)
 * - A mix of read (8) and unread (12) states
 * - Idempotency keys via demoIdempotency("notification", ...)
 * - retry/failed entries include last_delivery_error and delivery_attempts > 0
 */
export function buildNotificationFixture(
  anchor: Date,
): NotificationFixtureData {
  const notifications: Array<Insertable<DatabaseSchema["notifications"]>> =
    NOTIFICATION_PLAN.map((plan) => ({
      notification_id: IDS.notification[plan.notificationIdx]!,
      recipient_employee_id: plan.recipientEmployeeId,
      event_type: plan.eventType,
      aggregate_id: plan.aggregateId,
      idempotency_key: demoIdempotency(
        "notification",
        plan.recipientEmployeeId,
        String(plan.notificationIdx),
      ),
      message: plan.message,
      read_at: plan.isRead
        ? daysAgo(anchor, plan.daysOffset - 1)
        : null,
      delivery_status: plan.deliveryStatus,
      delivery_attempts: plan.deliveryAttempts,
      last_delivery_error: plan.lastDeliveryError,
      next_attempt_at:
        plan.deliveryStatus === "retry"
          ? daysAgo(anchor, plan.daysOffset + 1)
          : null,
      created_at: daysAgo(anchor, plan.daysOffset),
    }));

  return { notifications };
}
