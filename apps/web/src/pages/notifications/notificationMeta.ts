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

/** 创新需求子类型 → 动词（用于动态标题）。 */
const DEMAND_VERB: Readonly<Record<string, string>> = Object.freeze({
  "demand.submitted": "已提交",
  "demand.claimed": "已被认领",
  "demand.collaborator_assigned": "已分配协作者",
  "demand.progress_updated": "进度已更新",
  "demand.pilot_started": "试点已启动",
  "demand.closed": "已关闭",
  "demand.merged": "已合并",
});

export function resolveNotificationMeta(
  record: NotificationRecord,
): NotificationMeta {
  const { aggregateId, eventType, message, createdAt } = record;

  const commonActions = [{ label: "关闭", primary: false as const }];

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
      detailFields: [
        { label: "任务编号", value: aggregateId },
        { label: "状态", value: isFailed ? "失败" : "已完成" },
        { label: "触发时间", value: formatDateTime(createdAt) },
        {
          label: "处理建议",
          value: isFailed
            ? "请检查导出范围与权限后重试；多次失败请联系管理员。"
            : "导出文件已生成，可前往下载中心获取。",
        },
      ],
      detailLead: message,
      icon: BarChartOutlined,
      iconBg: "#13c2c2",
      iconColor: "#ffffff",
      subtitle: message,
      title: message.split("：")[0] ?? "数据分析通知",
    };
  }

  // ── 审核相关：应用评审/发布/撤回等生命周期 ────────────────────────────────
  if (
    eventType.includes("review_requested") ||
    eventType.includes("review_decided") ||
    eventType.includes("review_approved") ||
    eventType.includes("application.published") ||
    eventType.includes("withdrawn")
  ) {
    const appName = extractQuoted(message, "您的应用");
    let title: string;
    let lead: string;
    if (eventType.includes("review_requested")) {
      title = `应用「${appName}」待您审核`;
      lead = `应用「${appName}」已提交评审，等待您完成审核。`;
    } else if (eventType.includes("review_decided")) {
      title = `应用「${appName}」评审结论已出`;
      lead = `您提交的应用「${appName}」评审已结束，请查看结论。`;
    } else if (eventType.includes("withdrawn")) {
      title = `应用「${appName}」已撤回`;
      lead = `应用「${appName}」已被作者撤回。`;
    } else {
      title = `您的应用「${appName}」审核已通过`;
      lead = `您好！您提交的应用「${appName}」已通过平台审核，现已正式发布到应用市场。`;
    }
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
      detailLead: lead,
      icon: CheckCircleFilled,
      iconBg: "#722ed1",
      iconColor: "#ffffff",
      subtitle: lead,
      title,
    };
  }

  // ── 评论互动：评论/回复/评分 ───────────────────────────────────────────────
  if (
    eventType.includes("reviewed") ||
    eventType.includes("comment") ||
    eventType.includes("reply") ||
    eventType.includes("rating")
  ) {
    const appName = extractQuoted(message, message.replace(/^评论回复：/, ""));
    const isReply = eventType.includes("reply") || message.startsWith("评论回复");
    const isRating = eventType.includes("rating");
    return {
      actions: [
        { label: "查看应用详情", primary: true, to: applicationDetailRoute(aggregateId) },
        ...commonActions,
      ],
      category: "评论互动",
      detailFields: [
        { label: "应用名称", value: appName },
        { label: "互动类型", value: isRating ? "新的评分" : isReply ? "评论回复" : "新评价" },
        { label: "发生时间", value: formatDateTime(createdAt) },
      ],
      detailLead: isRating
        ? `用户给您的应用「${appName}」留下了新的评分，快去看看吧。`
        : isReply
          ? `王芳 回复了您在应用「${appName}」下的评论，快去看看吧。`
          : `用户“李小龙”给您的应用「${appName}」留下了评价和建议，快去看看吧。`,
      icon: isRating ? StarFilled : isReply ? CommentOutlined : MessageOutlined,
      iconBg: "#52c41a",
      iconColor: "#ffffff",
      subtitle: isRating
        ? `用户给应用「${appName}」留下了新的评分。`
        : isReply
          ? `王芳 回复了您在应用「${appName}」下的评论。`
          : `用户“李小龙”给您的应用留下了评价和建议。`,
      title: isRating
        ? `应用「${appName}」收到新的评分`
        : isReply
          ? `评论回复：${appName}`
          : `应用「${appName}」收到新的评价`,
    };
  }

  // ── 安全告警：扫描/安全/举报 ──────────────────────────────────────────────
  if (
    eventType.includes("scan") ||
    eventType.includes("security") ||
    eventType.includes("report")
  ) {
    const appName = extractQuoted(message, "指定应用");
    const isReport = eventType.includes("report");
    return {
      actions: [
        { label: "查看应用详情", primary: true, to: applicationDetailRoute(aggregateId) },
        ...(isReport ? [{ label: "前往处理举报" }] : []),
        { label: "前往审核记录", to: applicationReviewRoute(aggregateId) },
        ...commonActions,
      ],
      category: "安全告警",
      detailFields: [
        { label: "应用名称", value: appName },
        { label: "风险等级", value: isReport ? "需处理" : "高风险" },
        { label: "检测时间", value: formatDateTime(createdAt) },
        {
          label: "处理建议",
          value: isReport
            ? "请核实举报内容并决定是否下架或隐藏该应用。"
            : "请检查上传包中的可疑附件，必要时重新提交版本。",
        },
      ],
      detailLead: isReport
        ? `应用「${appName}」收到用户举报，请尽快核实处理。`
        : `在应用「${appName}」的上传包中检测到高风险文件，请及时处理。`,
      icon: WarningFilled,
      iconBg: "#f5222d",
      iconColor: "#ffffff",
      subtitle: isReport
        ? `应用「${appName}」收到用户举报，请尽快处理。`
        : `在应用「${appName}」的上传包中检测到高风险文件。`,
      title: isReport
        ? `应用「${appName}」收到举报`
        : message.includes("附件")
          ? message
          : `系统扫描发现风险：${message}`,
    };
  }

  // ── 平台公告 ──────────────────────────────────────────────────────────────
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

  // ── 创新需求 ──────────────────────────────────────────────────────────────
  if (eventType.includes("demand") || eventType.includes("innovation")) {
    const demandName = extractQuoted(message, "创新需求");
    const verb = DEMAND_VERB[eventType] ?? "已更新";
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
      detailFields: [
        { label: "需求名称", value: demandName },
        { label: "当前状态", value: verb },
        { label: "触发时间", value: formatDateTime(createdAt) },
      ],
      detailLead: `您的创新需求「${demandName}」${verb}，感谢您的贡献！`,
      icon: BulbOutlined,
      iconBg: "#faad14",
      iconColor: "#ffffff",
      subtitle: `您的创新需求「${demandName}」${verb}。`,
      title: `创新需求「${demandName}」${verb}`,
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
