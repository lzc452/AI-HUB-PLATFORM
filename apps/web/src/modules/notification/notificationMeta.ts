import {
  BarChartOutlined,
  BulbOutlined,
  CheckCircleFilled,
  CommentOutlined,
  MessageOutlined,
  SoundOutlined,
  StarFilled,
  WarningFilled,
} from "@ant-design/icons";
import type { ComponentType } from "react";

import type { NotificationRecord } from "./notification.client";

export interface NotificationMeta {
  /** 列表/详情左上角图标组件 */
  icon: ComponentType<{ className?: string }>;
  /** 图标容器背景色 */
  iconBg: string;
  /** 图标本身颜色（白色或深色） */
  iconColor: string;
  /** 分类标签文案，如"审核相关" */
  category: string;
  /** 列表与详情的主标题（payload.title 优先，缺省回退 message） */
  title: string;
  /** 列表中显示的副标题/摘要 */
  subtitle: string;
  /** 详情弹层正文（payload.body 优先，缺省回退 message） */
  detailLead: string;
  /** 详情弹层"通知信息"类结构化字段（仅真实记录字段，无硬编码演示数据） */
  detailFields: Array<{ label: string; value: string }>;
  /** 详情弹层底部行动按钮配置 */
  actions: Array<{
    icon?: ComponentType<{ className?: string }>;
    label: string;
    primary?: boolean;
    to?: string;
  }>;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

function applicationDetailRoute(aggregateId: string): string {
  return `/applications/${encodeURIComponent(aggregateId)}`;
}

function applicationReviewRoute(aggregateId: string): string {
  return `/applications/${encodeURIComponent(aggregateId)}/review`;
}

/**
 * 前端展示元数据解析：保留分类/图标/路由映射，文案一律由
 * payload（title/body/detail）与真实记录字段（eventType/aggregateId/createdAt）驱动，
 * 不包含任何硬编码演示数据（规格 §2.3/§3）。
 */
export function resolveNotificationMeta(
  record: NotificationRecord,
): NotificationMeta {
  const { aggregateId, eventType, message, createdAt, payload } = record;

  const commonActions = [{ label: "关闭", primary: false as const }];

  // 真实字段详情：事件类型 / 聚合 ID / 触发时间。
  const detailFields = [
    { label: "事件类型", value: eventType },
    { label: "聚合 ID", value: aggregateId },
    { label: "触发时间", value: formatDateTime(createdAt) },
  ];
  // payload 优先渲染，缺省回退 message（规格 §2.3）。
  const title = payload?.title ?? message.split("：")[0] ?? message;
  const subtitle = message;
  const detailLead = payload?.body ?? message;

  // ── 数据洞察：分析导出 / 助手任务 ──────────────────────────────────────────
  if (eventType.includes("analytics") || eventType.includes("export")) {
    const isFailed =
      eventType.endsWith(".failed") || eventType.includes("assistant.failed");
    return {
      actions: [
        { label: "查看导出详情", primary: true },
        ...(isFailed ? [{ label: "重试导出" }] : []),
        ...commonActions,
      ],
      category: "数据洞察",
      detailFields,
      detailLead,
      icon: BarChartOutlined,
      iconBg: "#13c2c2",
      iconColor: "#ffffff",
      subtitle,
      title,
    };
  }

  // ── 审核相关：应用评审/发布/撤回等生命周期 ────────────────────────────────
  if (
    eventType.includes("review.requested") ||
    eventType.includes("review.decided") ||
    eventType.includes("review.approved") ||
    eventType.includes("application.published") ||
    eventType.includes("withdrawn")
  ) {
    return {
      actions: [
        {
          label: "查看应用详情",
          primary: true,
          to: applicationDetailRoute(aggregateId),
        },
        { label: "前往审核记录", to: applicationReviewRoute(aggregateId) },
        { label: "分享应用" },
        ...commonActions,
      ],
      category: "审核相关",
      detailFields,
      detailLead,
      icon: CheckCircleFilled,
      iconBg: "#722ed1",
      iconColor: "#ffffff",
      subtitle,
      title,
    };
  }

  // ── 评论互动：评论/回复/评分 ───────────────────────────────────────────────
  if (
    eventType.includes("comment") ||
    eventType.includes("reply") ||
    eventType.includes("rating")
  ) {
    const isReply =
      eventType.includes("reply") || message.startsWith("评论回复");
    const isRating = eventType.includes("rating");
    return {
      actions: [
        {
          label: "查看应用详情",
          primary: true,
          to: applicationDetailRoute(aggregateId),
        },
        ...commonActions,
      ],
      category: "评论互动",
      detailFields,
      detailLead,
      icon: isRating ? StarFilled : isReply ? CommentOutlined : MessageOutlined,
      iconBg: "#52c41a",
      iconColor: "#ffffff",
      subtitle,
      title,
    };
  }

  // ── 安全告警：扫描/安全/举报 ──────────────────────────────────────────────
  if (
    eventType.includes("scan") ||
    eventType.includes("security") ||
    eventType.includes("report")
  ) {
    const isReport = eventType.includes("report");
    return {
      actions: [
        {
          label: "查看应用详情",
          primary: true,
          to: applicationDetailRoute(aggregateId),
        },
        ...(isReport ? [{ label: "前往处理举报" }] : []),
        { label: "前往审核记录", to: applicationReviewRoute(aggregateId) },
        ...commonActions,
      ],
      category: "安全告警",
      detailFields,
      detailLead,
      icon: WarningFilled,
      iconBg: "#f5222d",
      iconColor: "#ffffff",
      subtitle,
      title,
    };
  }

  // ── 平台公告 ──────────────────────────────────────────────────────────────
  if (eventType.includes("announcement") || eventType.includes("platform")) {
    return {
      actions: [{ label: "我知道了", primary: true }, ...commonActions],
      category: "平台公告",
      detailFields,
      detailLead,
      icon: SoundOutlined,
      iconBg: "#1677ff",
      iconColor: "#ffffff",
      subtitle,
      title,
    };
  }

  // ── 创新需求 ──────────────────────────────────────────────────────────────
  if (eventType.includes("demand") || eventType.includes("innovation")) {
    return {
      actions: [
        {
          label: "查看需求详情",
          primary: true,
          to: `/innovation/${encodeURIComponent(aggregateId)}`,
        },
        ...commonActions,
      ],
      category: "创新需求",
      detailFields,
      detailLead,
      icon: BulbOutlined,
      iconBg: "#faad14",
      iconColor: "#ffffff",
      subtitle,
      title,
    };
  }

  // ── 系统告警 ──────────────────────────────────────────────────────────────
  if (
    eventType.includes("system") ||
    eventType.includes("storage") ||
    eventType.includes("alert")
  ) {
    return {
      actions: [{ label: "查看详情", primary: true }, ...commonActions],
      category: "系统告警",
      detailFields,
      detailLead,
      icon: WarningFilled,
      iconBg: "#ff4d4f",
      iconColor: "#ffffff",
      subtitle,
      title,
    };
  }

  // Fallback
  return {
    actions: commonActions,
    category: "系统通知",
    detailFields,
    detailLead,
    icon: MessageOutlined,
    iconBg: "#1677ff",
    iconColor: "#ffffff",
    subtitle,
    title,
  };
}

export { formatRelativeTime };
