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

// ── notification plan (15: 3 per employee × 5) ──────────────────────────────

interface NotificationPlan {
  /** Index into IDS.notification[0..14] */
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

/**
 * 15 notifications covering:
 * - All 5 employee accounts (3 each)
 * - All 4 delivery statuses: pending(4), sent(5), retry(3), failed(3)
 * - Mix of read (6) and unread (9) states
 */
const NOTIFICATION_PLAN: readonly NotificationPlan[] = Object.freeze([
  // ── EMPLOYEE (3) ──────────────────────────────────────────────────────────
  {
    notificationIdx: 0,
    recipientEmployeeId: EMP.employee,
    eventType: "application.favorited",
    aggregateId: IDS.application.published[0]!,
    message: "智能排班助手 已被其他用户收藏",
    deliveryStatus: "pending",
    isRead: false,
    deliveryAttempts: 0,
    lastDeliveryError: null,
    daysOffset: 3,
  },
  {
    notificationIdx: 1,
    recipientEmployeeId: EMP.employee,
    eventType: "application.comment_replied",
    aggregateId: IDS.application.published[1]!,
    message: "有人回复了你在「薪酬查询报表」中的评论",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 5,
  },
  {
    notificationIdx: 2,
    recipientEmployeeId: EMP.employee,
    eventType: "demand.status_changed",
    aggregateId: IDS.demand.all[9]!,
    message: "你关注的需求「AI辅助项目风险评估」状态已更新为进行中",
    deliveryStatus: "failed",
    isRead: false,
    deliveryAttempts: 3,
    lastDeliveryError: "DingTalk webhook timeout after 5000ms",
    daysOffset: 7,
  },

  // ── APP-ADMIN (3) ─────────────────────────────────────────────────────────
  {
    notificationIdx: 3,
    recipientEmployeeId: EMP.appAdmin,
    eventType: "application.submitted_for_review",
    aggregateId: IDS.application.inReview[0]!,
    message: "应用「智能排班助手」已提交审核",
    deliveryStatus: "pending",
    isRead: false,
    deliveryAttempts: 0,
    lastDeliveryError: null,
    daysOffset: 4,
  },
  {
    notificationIdx: 4,
    recipientEmployeeId: EMP.appAdmin,
    eventType: "system.announcement",
    aggregateId: IDS.department.company,
    message: "系统将于本周六凌晨2:00-4:00进行维护升级",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 10,
  },
  {
    notificationIdx: 5,
    recipientEmployeeId: EMP.appAdmin,
    eventType: "demand.comment_added",
    aggregateId: IDS.demand.all[9]!,
    message: "需求「AI辅助项目风险评估」收到了新评论",
    deliveryStatus: "retry",
    isRead: false,
    deliveryAttempts: 2,
    lastDeliveryError: "DingTalk rate limit exceeded, will retry",
    daysOffset: 6,
  },

  // ── INNOVATION (3) ────────────────────────────────────────────────────────
  {
    notificationIdx: 6,
    recipientEmployeeId: EMP.innovation,
    eventType: "application.review_approved",
    aggregateId: IDS.application.approved[0]!,
    message: "你提交的应用「智能排班助手」审核已通过",
    deliveryStatus: "pending",
    isRead: true,
    deliveryAttempts: 0,
    lastDeliveryError: null,
    daysOffset: 8,
  },
  {
    notificationIdx: 7,
    recipientEmployeeId: EMP.innovation,
    eventType: "application.published",
    aggregateId: IDS.application.published[2]!,
    message: "「数据分析驾驶舱」已成功发布上线",
    deliveryStatus: "sent",
    isRead: false,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 9,
  },
  {
    notificationIdx: 8,
    recipientEmployeeId: EMP.innovation,
    eventType: "demand.progress_updated",
    aggregateId: IDS.demand.all[10]!,
    message: "你关注的需求「多语言文档翻译与校对系统」发布了新进度",
    deliveryStatus: "failed",
    isRead: false,
    deliveryAttempts: 3,
    lastDeliveryError: "Webhook URL unreachable after 3 attempts",
    daysOffset: 2,
  },

  // ── ORG-ADMIN (3) ─────────────────────────────────────────────────────────
  {
    notificationIdx: 9,
    recipientEmployeeId: EMP.orgAdmin,
    eventType: "application.reported",
    aggregateId: IDS.application.published[3]!,
    message: "应用「消息推送中心」收到举报，请及时处理",
    deliveryStatus: "pending",
    isRead: false,
    deliveryAttempts: 0,
    lastDeliveryError: null,
    daysOffset: 5,
  },
  {
    notificationIdx: 10,
    recipientEmployeeId: EMP.orgAdmin,
    eventType: "demand.published",
    aggregateId: IDS.demand.published[0]!,
    message: "需求「智能排班与资源调度系统」已发布，等待团队承接",
    deliveryStatus: "sent",
    isRead: true,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 11,
  },
  {
    notificationIdx: 11,
    recipientEmployeeId: EMP.orgAdmin,
    eventType: "system.maintenance",
    aggregateId: IDS.department.company,
    message: "例行安全扫描已完成，发现2个低风险项需关注",
    deliveryStatus: "retry",
    isRead: false,
    deliveryAttempts: 2,
    lastDeliveryError: "Delivery failed due to network error",
    daysOffset: 1,
  },

  // ── SUPER-ADMIN (3) ───────────────────────────────────────────────────────
  {
    notificationIdx: 12,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "application.rating_added",
    aggregateId: IDS.application.published[4]!,
    message: "应用「安全策略配置」收到了新的评分",
    deliveryStatus: "sent",
    isRead: false,
    deliveryAttempts: 1,
    lastDeliveryError: null,
    daysOffset: 7,
  },
  {
    notificationIdx: 13,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "system.audit_alert",
    aggregateId: IDS.department.company,
    message: "检测到异常登录行为，来源IP: 192.168.1.100",
    deliveryStatus: "retry",
    isRead: true,
    deliveryAttempts: 2,
    lastDeliveryError: "Connection reset by peer",
    daysOffset: 4,
  },
  {
    notificationIdx: 14,
    recipientEmployeeId: EMP.superAdmin,
    eventType: "application.review_assigned",
    aggregateId: IDS.application.inReview[1]!,
    message: "你被分配审核应用「薪酬查询报表」，请尽快完成",
    deliveryStatus: "failed",
    isRead: true,
    deliveryAttempts: 3,
    lastDeliveryError: "DingTalk API returned 500 Internal Server Error",
    daysOffset: 12,
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
 * Produces 15 notifications (3 per employee account × 5) covering:
 * - Read (6) and unread (9) states
 * - All 4 delivery statuses: pending(4), sent(5), retry(3), failed(3)
 * - Idempotency keys via demoIdempotency("notification", ...)
 * - Retry/failed entries include last_delivery_error and delivery_attempts > 0
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
