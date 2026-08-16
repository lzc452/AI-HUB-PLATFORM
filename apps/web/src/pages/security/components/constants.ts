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

export function getSecurityKpiStats(
  rows: readonly AuditLogRow[],
): SecurityKpiStat[] {
  const highRiskAlerts = rows.filter((row) =>
    ["高风险", "critical", "high"].includes(row.detail.riskLevel),
  ).length;
  const quarantinedFiles = rows.filter((row) =>
    /隔离|quarantine|infect/i.test(`${row.actionType} ${row.summary}`),
  ).length;
  const configChanges = rows.filter((row) =>
    /配置|策略|config|policy/i.test(`${row.module} ${row.actionType}`),
  ).length;
  return [
    {
      Icon: SafetyCertificateFilled,
      iconBgClass: "bg-[#e6f4ff]",
      iconColorClass: "text-[#1677ff]",
      key: "activeSessions",
      label: "活跃会话",
      trendArrow: "up",
      trendClass: "text-[#8c8c8c]",
      trendText: "后端暂未提供趋势",
      value: "—",
    },
    {
      Icon: AlertFilled,
      iconBgClass: "bg-[#fff1f0]",
      iconColorClass: "text-[#ff4d4f]",
      key: "highRiskAlerts",
      label: "高风险告警",
      trendArrow: "down",
      trendClass: "text-[#8c8c8c]",
      trendText: "当前审计记录",
      value: String(highRiskAlerts),
    },
    {
      Icon: FolderFilled,
      iconBgClass: "bg-[#fff7e6]",
      iconColorClass: "text-[#fa8c16]",
      key: "quarantinedFiles",
      label: "隔离文件事件",
      trendArrow: "up",
      trendClass: "text-[#8c8c8c]",
      trendText: "当前审计记录",
      value: String(quarantinedFiles),
    },
    {
      Icon: SettingFilled,
      iconBgClass: "bg-[#f9f0ff]",
      iconColorClass: "text-[#722ed1]",
      key: "configChanges",
      label: "配置变更事件",
      trendArrow: "up",
      trendClass: "text-[#8c8c8c]",
      trendText: "当前审计记录",
      value: String(configChanges),
    },
  ];
}

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

export function getSecurityOverviewItems(
  rows: readonly AuditLogRow[],
): SecurityOverviewItem[] {
  const riskFiles = rows.filter((row) =>
    ["高风险", "critical", "high"].includes(row.detail.riskLevel),
  ).length;
  const forceLogoutUsers = rows.filter((row) =>
    /强制下线|force.?logout/i.test(`${row.actionType} ${row.summary}`),
  ).length;
  return [
    {
      Icon: SafetyCertificateOutlined,
      iconBgClass: "bg-[#e6f4ff]",
      iconColorClass: "text-[#1677ff]",
      key: "scanRate",
      label: "扫描成功率",
      trendArrow: "up",
      trendClass: "text-[#8c8c8c]",
      trendText: "后端暂未提供扫描统计",
      unit: "",
      value: "—",
      valueClass: "text-[#8c8c8c]",
    },
    {
      Icon: FileExclamationOutlined,
      iconBgClass: "bg-[#fff7e6]",
      iconColorClass: "text-[#fa8c16]",
      key: "riskFiles",
      label: "风险文件事件",
      trendArrow: "up",
      trendClass: "text-[#8c8c8c]",
      trendText: "当前审计记录",
      unit: "",
      value: String(riskFiles),
      valueClass: "text-[#fa8c16]",
    },
    {
      Icon: UserOutlined,
      iconBgClass: "bg-[#e6f4ff]",
      iconColorClass: "text-[#1677ff]",
      key: "forceLogoutUsers",
      label: "强制下线事件",
      trendArrow: "down",
      trendClass: "text-[#8c8c8c]",
      trendText: "当前审计记录",
      unit: "",
      value: String(forceLogoutUsers),
      valueClass: "text-[#1677ff]",
    },
  ];
}

/** 概况卡右上角数据截至时间（设计图逐字）。 */
export function getOverviewAsOf(rows: readonly AuditLogRow[]): string {
  const latest = rows
    .map((row) => row.time)
    .sort((left, right) => right.localeCompare(left))[0];
  return latest ? `数据截至 ${latest}` : "暂无审计数据";
}

/** 筛选状态聚合为单一对象，由 SecurityPage 容器持有。 */
export interface AuditFilterValue {
  /** 操作类型，空字符串表示「全部」。 */
  actionType: string;
  /** 模块，空字符串表示「全部」。 */
  module: string;
  /** 操作人，空字符串表示「全部」。 */
  operator: string;
  /** 风险等级（low/medium/high），空字符串表示「全部」。 */
  risk: string;
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
    risk: "",
    range: [dayjs("2025-06-01 00:00"), dayjs("2025-06-01 23:59")],
    searchText: "",
  };
}

/** Select「全部」选项：value 为空字符串即不过滤。 */
export const ALL_FILTER_OPTION = { label: "全部", value: "" };

/** 风险等级筛选选项（值对齐后端 risk 语义，high 覆盖 critical）。 */
export const RISK_FILTER_OPTIONS = [
  ALL_FILTER_OPTION,
  { label: "低风险", value: "low" },
  { label: "中风险", value: "medium" },
  { label: "高风险", value: "high" },
] as const;
