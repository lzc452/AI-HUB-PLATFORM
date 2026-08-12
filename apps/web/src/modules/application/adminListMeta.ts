import type { DeliveryChannel } from "@ai-hub/contracts";

/**
 * 应用管理页面专用的扩展应用记录。
 * 在 CreatorApplicationRecord 之上补充了运营视角需要的负责人、当前版本、交付渠道、最近更新时间。
 * 字段命名与设计稿表格列一一对应。
 */
export interface AdminApplicationRow {
  applicationId: string;
  name: string;
  summary: string;
  categoryId: string;
  status: AdminApplicationStatus;
  currentVersion: string;
  currentVersionId: string | null;
  ownerName: string;
  departmentName: string;
  deliveryChannels: readonly DeliveryChannel[];
  updatedAt: string;
  isMine: boolean;
  needsMyReview: boolean;
}

export type AdminApplicationStatus =
  | "published"
  | "approved"
  | "in_review"
  | "draft"
  | "withdrawn";

/** 应用管理筛选模式，对应设计稿 Tab 顺序。 */
export type AdminApplicationFilterMode = "all" | "review" | "owned";

/** 单一交付渠道的展示元数据：图标、名称、配色。 */
export interface ChannelMeta {
  icon: React.ReactNode;
  label: string;
}

/** 状态徽标元数据：颜色、标签、底色，配合设计稿差异化配色。 */
export interface StatusBadgeMeta {
  label: string;
  color: string;
  background: string;
  border: string;
}

/** 单张 KPI 卡的元数据：图标、标签、数值、配色。 */
export interface AdminKpiMeta {
  accent: string;
  background: string;
  border: string;
  iconBackground: string;
  iconColor: string;
  label: string;
  value: number;
  hint: string;
}

export interface AdminKpiCards {
  deliveryFailed: AdminKpiMeta;
  pendingReview: AdminKpiMeta;
  published: AdminKpiMeta;
  total: AdminKpiMeta;
}
