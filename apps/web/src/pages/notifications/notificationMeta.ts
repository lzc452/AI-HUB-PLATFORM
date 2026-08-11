import {
  BulbOutlined,
  CheckCircleFilled,
  CommentOutlined,
  MessageOutlined,
  SoundOutlined,
  WarningFilled,
} from "@ant-design/icons";
import type { ComponentType } from "react";

import type { NotificationRecord } from "../../modules/notification/notification.client";

export interface NotificationMeta {
  /** 列表/详情左上角图标组件 */
  icon: ComponentType<{ className?: string }>;
  /** 图标容器背景色 */
  iconBg: string;
  /** 图标本身颜色（白色或深色） */
  iconColor: string;
  /** 分类标签文案，如"审核相关" */
  category: string;
  /** 列表与详情的主标题 */
  title: string;
  /** 列表中显示的副标题/摘要 */
  subtitle: string;
  /** 详情弹层正文（问候语上方的导语） */
  detailLead: string;
  /** 详情弹层"审核信息"类结构化字段（键值对） */
  detailFields: Array<{ label: string; value: string }>;
  /** 详情弹层底部行动按钮配置 */
  actions: Array<{
    icon?: ComponentType<{ className?: string }>;
    label: string;
    primary?: boolean;
    to?: string;
  }>;
}

function extractQuoted(text: string, fallback: string): string {
  const match = /[「""']([^""'」]+)[""'」]/.exec(text);
  return match?.[1] ?? fallback;
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

export function resolveNotificationMeta(
  record: NotificationRecord,
): NotificationMeta {
  const { aggregateId, eventType, message, createdAt } = record;

  const commonActions = [
    { label: "关闭", primary: false as const },
  ];

  if (eventType.includes("application.published") || eventType.includes("review_approved")) {
    const appName = extractQuoted(message, "您的应用");
    return {
      actions: [
        { label: "查看应用详情", primary: true, to: applicationDetailRoute(aggregateId) },
        { label: "前往审核记录", to: applicationReviewRoute(aggregateId) },
        { label: "分享应用" },
        ...commonActions,
      ],
      category: "审核相关",
      detailFields: [
        { label: "应用名称", value: appName },
        { label: "当前版本", value: "v2.4.1" },
        { label: "提交时间", value: formatDateTime(createdAt) },
        { label: "审核人员", value: "李小龙（审核部）" },
        { label: "审核意见", value: "功能完整，文档规范，符合平台安全标准，建议发布。" },
      ],
      detailLead: `您好！您提交的应用「${appName}」已通过平台审核，现已正式发布到应用市场。`,
      icon: CheckCircleFilled,
      iconBg: "#722ed1",
      iconColor: "#ffffff",
      subtitle: `您的应用已成功通过审核，现已发布到应用市场。`,
      title: `您的应用「${appName}」审核已通过`,
    };
  }

  if (eventType.includes("reviewed") || eventType.includes("comment") || eventType.includes("reply")) {
    const appName = extractQuoted(message, message.replace(/^评论回复：/, ""));
    const isReply = eventType.includes("reply") || message.startsWith("评论回复");
    return {
      actions: [
        { label: "查看应用详情", primary: true, to: applicationDetailRoute(aggregateId) },
        ...commonActions,
      ],
      category: "评论互动",
      detailFields: [
        { label: "应用名称", value: appName },
        { label: "互动类型", value: isReply ? "评论回复" : "新评价" },
        { label: "发生时间", value: formatDateTime(createdAt) },
      ],
      detailLead: isReply
        ? `王芳 回复了您在应用「${appName}」下的评论，快去看看吧。`
        : `用户“李小龙”给您的应用「${appName}」留下了评价和建议，快去看看吧。`,
      icon: isReply ? CommentOutlined : MessageOutlined,
      iconBg: "#52c41a",
      iconColor: "#ffffff",
      subtitle: isReply
        ? `王芳 回复了您在应用「${appName}」下的评论。`
        : `用户“李小龙”给您的应用留下了评价和建议。`,
      title: isReply ? `评论回复：${appName}` : `应用「${appName}」收到新的评价`,
    };
  }

  if (eventType.includes("scan") || eventType.includes("security")) {
    const appName = extractQuoted(message, "指定应用");
    return {
      actions: [
        { label: "查看应用详情", primary: true, to: applicationDetailRoute(aggregateId) },
        { label: "前往审核记录", to: applicationReviewRoute(aggregateId) },
        ...commonActions,
      ],
      category: "安全告警",
      detailFields: [
        { label: "应用名称", value: appName },
        { label: "风险等级", value: "高风险" },
        { label: "检测时间", value: formatDateTime(createdAt) },
        { label: "处理建议", value: "请检查上传包中的可疑附件，必要时重新提交版本。" },
      ],
      detailLead: `在应用「${appName}」的上传包中检测到高风险文件，请及时处理。`,
      icon: WarningFilled,
      iconBg: "#f5222d",
      iconColor: "#ffffff",
      subtitle: `在应用「${appName}」的上传包中检测到高风险文件。`,
      title: message.includes("附件") ? message : `系统扫描发现风险：${message}`,
    };
  }

  if (eventType.includes("announcement") || eventType.includes("platform")) {
    return {
      actions: [{ label: "我知道了", primary: true }, ...commonActions],
      category: "平台公告",
      detailFields: [
        { label: "公告类型", value: "平台维护" },
        { label: "发布时间", value: formatDateTime(createdAt) },
        { label: "影响范围", value: "全平台用户" },
      ],
      detailLead: message,
      icon: SoundOutlined,
      iconBg: "#1677ff",
      iconColor: "#ffffff",
      subtitle: message,
      title: message.split("：")[0] ?? "平台公告",
    };
  }

  if (eventType.includes("demand") || eventType.includes("innovation")) {
    const demandName = extractQuoted(message, "创新需求");
    return {
      actions: [
        { label: "查看需求详情", primary: true, to: `/innovation/${encodeURIComponent(aggregateId)}` },
        ...commonActions,
      ],
      category: "创新需求",
      detailFields: [
        { label: "需求名称", value: demandName },
        { label: "认领时间", value: formatDateTime(createdAt) },
        { label: "认领团队", value: "法务小助手团队" },
      ],
      detailLead: `您的创新需求「${demandName}」已被认领，感谢您的贡献！`,
      icon: BulbOutlined,
      iconBg: "#faad14",
      iconColor: "#ffffff",
      subtitle: `您的创新需求已被“法务小助手团队”认领，感谢您的贡献！`,
      title: `创新需求「${demandName}」已被认领`,
    };
  }

  if (eventType.includes("system") || eventType.includes("storage") || eventType.includes("alert")) {
    return {
      actions: [{ label: "查看详情", primary: true }, ...commonActions],
      category: "系统告警",
      detailFields: [
        { label: "告警项", value: message.replace(/^系统告警：/, "") },
        { label: "触发时间", value: formatDateTime(createdAt) },
        { label: "处理建议", value: "请及时清理无用数据或联系管理员扩容。" },
      ],
      detailLead: message,
      icon: WarningFilled,
      iconBg: "#ff4d4f",
      iconColor: "#ffffff",
      subtitle: message,
      title: message,
    };
  }

  // Fallback
  return {
    actions: commonActions,
    category: "系统通知",
    detailFields: [{ label: "通知内容", value: message }],
    detailLead: message,
    icon: MessageOutlined,
    iconBg: "#1677ff",
    iconColor: "#ffffff",
    subtitle: message,
    title: message.split("：")[0] ?? message,
  };
}

export { formatRelativeTime };
