import { describe, expect, it } from "vitest";

import type { NotificationRecord } from "./notification.client";
import { resolveNotificationMeta } from "./notificationMeta";

/**
 * 21 个权威通知类型 → 期望前端分类。
 * 用于验证「前端完整展示」：每个后端可产生的通知类型都必须落到专属分类，
 * 不得落入兜底分支「系统通知」。
 */
const CASES: ReadonlyArray<{
  eventType: string;
  message: string;
  expectedCategory: string;
}> = [
  {
    eventType: "application.review.requested",
    message: "应用「智能排班助手」已提交评审，请尽快审核。",
    expectedCategory: "审核相关",
  },
  {
    eventType: "application.review.decided",
    message: "您提交的应用「智能排班助手」评审已通过。",
    expectedCategory: "审核相关",
  },
  {
    eventType: "application.published",
    message: "「数据分析驾驶舱」已成功发布上线。",
    expectedCategory: "审核相关",
  },
  {
    eventType: "application.withdrawn",
    message: "应用「旧版报表工具」已被作者撤回。",
    expectedCategory: "审核相关",
  },
  {
    eventType: "demand.submitted",
    message: "您提交的需求「AI 辅助项目风险评估」已进入评审流程。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "demand.claimed",
    message: "需求「多语言文档翻译与校对系统」已被交付团队认领。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "demand.collaborator_assigned",
    message: "你已被分配至需求「智能合同审查助手」。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "demand.progress_updated",
    message: "需求「AI 辅助项目风险评估」进度已更新为进行中。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "demand.pilot_started",
    message: "需求「多语言文档翻译与校对系统」的试点已启动。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "demand.closed",
    message: "需求「历史数据归档治理」已关闭。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "demand.merged",
    message: "需求「智能会议纪要生成」已合并至主需求。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "demand.reviewed",
    message: "需求「智能会议纪要生成」的审核结论：reject。",
    expectedCategory: "创新需求",
  },
  {
    eventType: "analytics.export.completed",
    message: "分析导出 job-weekly-report 已就绪（weekly-report）。",
    expectedCategory: "数据洞察",
  },
  {
    eventType: "analytics.export.failed",
    message: "分析导出 job-risk-dashboard 失败，已安全处理。",
    expectedCategory: "数据洞察",
  },
  {
    eventType: "analytics.assistant.failed",
    message: "外部助手请求 assistant-risk-copilot 当前不可用。",
    expectedCategory: "数据洞察",
  },
  {
    eventType: "system.announcement",
    message: "系统将于本周六凌晨 2:00-4:00 进行维护升级。",
    expectedCategory: "平台公告",
  },
  {
    eventType: "system.maintenance",
    message: "例行安全扫描已完成，发现 2 个低风险项需关注。",
    expectedCategory: "系统告警",
  },
  {
    eventType: "system.audit_alert",
    message: "检测到异常登录行为，来源 IP: 192.168.1.100。",
    expectedCategory: "系统告警",
  },
  {
    eventType: "application.comment_replied",
    message: "有人回复了你在「薪酬查询报表」中的评论。",
    expectedCategory: "评论互动",
  },
  {
    eventType: "application.rating_added",
    message: "应用「安全策略配置」收到了新的评分（5 星）。",
    expectedCategory: "评论互动",
  },
  {
    eventType: "application.reported",
    message: "应用「消息推送中心」收到举报，请及时处理。",
    expectedCategory: "安全告警",
  },
];

/** 验收 A4：禁止残留的硬编码演示数据关键词。 */
const DEMO_KEYWORDS = [
  "v2.4.1",
  "李小龙",
  "王芳",
  "审核部",
  "系统（审核中心）",
];

function recordOf(
  eventType: string,
  message: string,
  payload?: NotificationRecord["payload"],
): NotificationRecord {
  return {
    aggregateId: "agg-1",
    createdAt: "2025-06-15T12:00:00.000Z",
    eventType,
    idempotencyKey: `demo:notification:${eventType}`,
    message,
    notificationId: "n-1",
    readAt: null,
    recipientEmployeeId: "DEMO-EMPLOYEE",
    ...(payload !== undefined ? { payload } : {}),
  };
}

describe("resolveNotificationMeta — 前端展示完整性", () => {
  it("覆盖 21 个权威通知类型", () => {
    expect(CASES).toHaveLength(21);
  });

  for (const { eventType, message, expectedCategory } of CASES) {
    it(`${eventType} → ${expectedCategory}`, () => {
      const meta = resolveNotificationMeta(recordOf(eventType, message));
      expect(meta.category).toBe(expectedCategory);
      // 关键：不得落入兜底分类
      expect(meta.category).not.toBe("系统通知");
      // 关键：必须有图标、标题、副标题与详情字段
      expect(meta.icon).toBeDefined();
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.subtitle.length).toBeGreaterThan(0);
      expect(meta.detailFields.length).toBeGreaterThan(0);
    });
  }

  it("全部输出不含硬编码演示数据关键词（A4）", () => {
    for (const { eventType, message } of CASES) {
      const meta = resolveNotificationMeta(recordOf(eventType, message));
      const outputs = [
        meta.category,
        meta.title,
        meta.subtitle,
        meta.detailLead,
        ...meta.detailFields.map((field) => `${field.label}:${field.value}`),
        ...meta.actions.map((action) => action.label),
      ];
      for (const keyword of DEMO_KEYWORDS) {
        expect(
          outputs.some((output) => output.includes(keyword)),
          `${eventType} 的输出不应包含演示关键词「${keyword}」`,
        ).toBe(false);
      }
    }
  });

  it("详情字段由真实记录字段驱动（事件类型/聚合 ID/触发时间）", () => {
    const meta = resolveNotificationMeta(
      recordOf("application.published", "「数据分析驾驶舱」已成功发布上线。"),
    );
    const labels = meta.detailFields.map((field) => field.label);
    expect(labels).toEqual(["事件类型", "聚合 ID", "触发时间"]);
    const values = Object.fromEntries(
      meta.detailFields.map((field) => [field.label, field.value]),
    );
    expect(values["事件类型"]).toBe("application.published");
    expect(values["聚合 ID"]).toBe("agg-1");
  });

  it("payload.title / payload.body 优先驱动标题与正文，缺省回退 message", () => {
    const withPayload = resolveNotificationMeta(
      recordOf("application.published", "「数据分析驾驶舱」已成功发布上线。", {
        body: "您的应用已通过平台审核并正式发布到应用市场。",
        title: "「数据分析驾驶舱」已正式发布",
      }),
    );
    expect(withPayload.title).toBe("「数据分析驾驶舱」已正式发布");
    expect(withPayload.detailLead).toBe(
      "您的应用已通过平台审核并正式发布到应用市场。",
    );

    const withoutPayload = resolveNotificationMeta(
      recordOf("application.published", "「数据分析驾驶舱」已成功发布上线。"),
    );
    expect(withoutPayload.title).toBe("「数据分析驾驶舱」已成功发布上线。");
    expect(withoutPayload.detailLead).toBe(
      "「数据分析驾驶舱」已成功发布上线。",
    );
  });
});
