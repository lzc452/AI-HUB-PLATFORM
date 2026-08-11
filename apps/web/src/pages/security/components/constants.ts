import {
  AlertFilled,
  FileExclamationOutlined,
  FolderFilled,
  SafetyCertificateFilled,
  SafetyCertificateOutlined,
  SettingFilled,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { ComponentType } from "react";

import type { AuditLogRow } from "../../../modules/security";

/** 图标组件统一类型（仅 className 透传，颜色/尺寸由 Tailwind 任意值控制）。 */
export type SecurityIconComponent = ComponentType<{ className?: string }>;

/**
 * 操作类型 → antd Tag 语义色映射：
 * 绿 success＝登录成功、放行隔离文件；蓝 processing＝修改上传限制、重置密码策略、创建 API 密钥；
 * 橙 warning＝强制下线会话、下载敏感文件；红 error＝高风险告警。
 */
export const ACTION_TYPE_META: Record<
  string,
  "success" | "processing" | "warning" | "error"
> = {
  "创建 API 密钥": "processing",
  下载敏感文件: "warning",
  修改上传限制: "processing",
  强制下线会话: "warning",
  放行隔离文件: "success",
  登录成功: "success",
  重置密码策略: "processing",
  高风险告警: "error",
};

/** 风险等级 → 圆点/文字颜色（「低风险」用 CSS 圆点，不用图标）。 */
export const RISK_META: Record<
  AuditLogRow["detail"]["riskLevel"],
  { dotClass: string; textClass: string }
> = {
  低风险: { dotClass: "bg-[#52c41a]", textClass: "text-[#52c41a]" },
  中风险: { dotClass: "bg-[#fa8c16]", textClass: "text-[#fa8c16]" },
  高风险: { dotClass: "bg-[#ff4d4f]", textClass: "text-[#ff4d4f]" },
};

/** KPI 卡展示数据（设计图逐字）。 */
export interface SecurityKpiStat {
  Icon: SecurityIconComponent;
  iconBgClass: string;
  iconColorClass: string;
  key: string;
  label: string;
  trendArrow: "up" | "down";
  trendClass: string;
  trendText: string;
  value: string;
}

export const SECURITY_KPI_STATS: SecurityKpiStat[] = [
  {
    Icon: SafetyCertificateFilled,
    iconBgClass: "bg-[#e6f4ff]",
    iconColorClass: "text-[#1677ff]",
    key: "activeSessions",
    label: "活跃会话",
    trendArrow: "up",
    trendClass: "text-[#52c41a]",
    trendText: "12%",
    value: "86",
  },
  {
    // 设计图为红色警灯，@ant-design/icons 无精确匹配，用最近似的 AlertFilled 代替
    Icon: AlertFilled,
    iconBgClass: "bg-[#fff1f0]",
    iconColorClass: "text-[#ff4d4f]",
    key: "highRiskAlerts",
    label: "高风险告警",
    trendArrow: "down",
    trendClass: "text-[#52c41a]",
    trendText: "1",
    value: "3",
  },
  {
    // 设计图为文件夹+锁，无精确匹配，用最近似的 FolderFilled 代替
    Icon: FolderFilled,
    iconBgClass: "bg-[#fff7e6]",
    iconColorClass: "text-[#fa8c16]",
    key: "quarantinedFiles",
    label: "隔离文件",
    trendArrow: "up",
    trendClass: "text-[#ff4d4f]",
    trendText: "2",
    value: "12",
  },
  {
    Icon: SettingFilled,
    iconBgClass: "bg-[#f9f0ff]",
    iconColorClass: "text-[#722ed1]",
    key: "configChanges",
    label: "配置变更",
    trendArrow: "up",
    trendClass: "text-[#ff4d4f]",
    trendText: "1",
    value: "5",
  },
];

/** 今日安全概况迷你项展示数据（设计图逐字）。 */
export interface SecurityOverviewItem {
  Icon: SecurityIconComponent;
  iconBgClass: string;
  iconColorClass: string;
  key: string;
  label: string;
  trendArrow: "up" | "down";
  trendClass: string;
  trendText: string;
  unit: string;
  value: string;
  valueClass: string;
}

export const SECURITY_OVERVIEW_ITEMS: SecurityOverviewItem[] = [
  {
    Icon: SafetyCertificateOutlined,
    iconBgClass: "bg-[#e6f4ff]",
    iconColorClass: "text-[#1677ff]",
    key: "scanRate",
    label: "扫描成功率",
    trendArrow: "up",
    trendClass: "text-[#52c41a]",
    trendText: "0.8%",
    unit: "%",
    value: "99.2",
    valueClass: "text-[#52c41a]",
  },
  {
    Icon: FileExclamationOutlined,
    iconBgClass: "bg-[#fff7e6]",
    iconColorClass: "text-[#fa8c16]",
    key: "riskFiles",
    label: "风险文件",
    trendArrow: "up",
    trendClass: "text-[#ff4d4f]",
    trendText: "2",
    unit: "",
    value: "12",
    valueClass: "text-[#fa8c16]",
  },
  {
    Icon: UserOutlined,
    iconBgClass: "bg-[#e6f4ff]",
    iconColorClass: "text-[#1677ff]",
    key: "forceLogoutUsers",
    label: "最近强制下线用户",
    trendArrow: "down",
    trendClass: "text-[#52c41a]",
    trendText: "1",
    unit: "人",
    value: "3",
    valueClass: "text-[#1677ff]",
  },
];

/** 概况卡右上角数据截至时间（设计图逐字）。 */
export const OVERVIEW_AS_OF = "数据截至 2025-06-01 10:30";

/** 筛选状态聚合为单一对象，由 SecurityPage 容器持有。 */
export interface AuditFilterValue {
  /** 操作类型，空字符串表示「全部」。 */
  actionType: string;
  /** 模块，空字符串表示「全部」。 */
  module: string;
  /** 操作人，空字符串表示「全部」。 */
  operator: string;
  /** 时间范围（设计图默认 2025-06-01 全天）。 */
  range: [Dayjs, Dayjs] | null;
  /** 搜索追踪 ID / 详情摘要。 */
  searchText: string;
}

export function createDefaultFilters(): AuditFilterValue {
  return {
    actionType: "",
    module: "",
    operator: "",
    range: [dayjs("2025-06-01 00:00"), dayjs("2025-06-01 23:59")],
    searchText: "",
  };
}

/** Select「全部」选项：value 为空字符串即不过滤。 */
export const ALL_FILTER_OPTION = { label: "全部", value: "" };
