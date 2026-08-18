/**
 * 审核 SLA 提醒定时任务（规格 §5.5，基准 = SLA 截止时刻 sla_due_at）。
 *
 * - SLA 截止前 24h 内且已领取 → 提醒领取人（站内通知，事件 application.review.sla.reminder）。
 * - SLA 已超时且未结论（available/claimed）→ 通知全部应用管理员 + 超级管理员
 *   （站内通知，事件 application.review.sla.overdue）。
 *
 * 只发提醒，不自动审批。通知走 NotificationService.createForEvent —— 幂等键
 * `${eventType}:${aggregateId}:${recipientEmployeeId}` 保证每次提醒只入站一次；
 * 该通道同时写入 notification.created outbox 事件，由 worker 的钉钉处理器投递。
 */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export interface ExpiredReview {
  applicationVersionId: string;
  claimedByEmployeeId: string | null;
  ownerEmployeeId: string;
  name: string;
}

export interface SlaReminderDeps {
  /** SLA 截止前 hours 小时内已领取（status='claimed'）的审核。 */
  listReviewsDueWithin: (
    now: Date,
    hours: number,
  ) => Promise<readonly ExpiredReview[]>;
  /** 已超时（sla_due_at < now）且未结论（status in available/claimed）的审核。 */
  listExpiredReviews: (now: Date) => Promise<readonly ExpiredReview[]>;
  listApplicationAdmins: () => Promise<string[]>;
  createNotification: (input: {
    recipientEmployeeId: string;
    eventType: string;
    aggregateId: string;
    message: string;
    metadata?: Readonly<Record<string, string>>;
  }) => Promise<void>;
  now?: () => Date;
}

export function createSlaReminderRunner(deps: SlaReminderDeps) {
  const now = deps.now ?? (() => new Date());
  return async (): Promise<void> => {
    const current = now();
    for (const review of await deps.listReviewsDueWithin(current, 24)) {
      // 查询已限定 claimed；防御性保留判空，available 无领取人则不提醒。
      if (review.claimedByEmployeeId !== null) {
        await deps.createNotification({
          recipientEmployeeId: review.claimedByEmployeeId,
          eventType: "application.review.sla.reminder",
          aggregateId: review.applicationVersionId,
          message: `应用「${review.name}」审核将于 24 小时内到期，请及时处理。`,
        });
      }
    }
    for (const review of await deps.listExpiredReviews(current)) {
      for (const admin of await deps.listApplicationAdmins()) {
        await deps.createNotification({
          recipientEmployeeId: admin,
          eventType: "application.review.sla.overdue",
          aggregateId: review.applicationVersionId,
          message: `应用「${review.name}」审核已超过 SLA（2 个工作日），请处理。`,
        });
      }
    }
  };
}
