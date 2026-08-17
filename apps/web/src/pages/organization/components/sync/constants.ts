export type SyncTaskType =
  | "full"
  | "incremental"
  | "compensation"
  | "validation"
  | "pending";

export type SyncTaskStatus = "success" | "failed" | "pending";

export type SyncObject =
  | "organization"
  | "user"
  | "department"
  | "user_binding";

export type SyncAlertStatus = "unprocessed" | "processing";

export interface SyncTaskSummary {
  /** 任务 ID */
  taskId: string;
  /** 任务名称 */
  taskName: string;
  /** 同步对象 */
  object: SyncObject;
  /** 任务类型 */
  taskType: SyncTaskType;
  /** 开始时间 */
  startedAt: string;
  /** 耗时文本 */
  duration: string;
  /** 执行状态 */
  status: SyncTaskStatus;
  /** 结果摘要 */
  resultSummary: string;
}

export interface SyncAlertSummary {
  /** 告警 ID */
  alertId: string;
  /** 告警标题 */
  title: string;
  /** 最近失败原因 / 描述 */
  description: string;
  /** 处理状态 */
  status: SyncAlertStatus;
  /** 发生时间 */
  time: string;
}

export interface SyncLogSummary {
  /** 日志 ID */
  logId: string;
  /** 时间 */
  time: string;
  /** 日志内容 */
  message: string;
  /** 是否成功 */
  success: boolean;
}

export interface SyncStatsSummary {
  /** 今日同步任务数 */
  todayTaskCount: number;
  /** 今日任务较昨日变化 */
  todayTaskTrend: number;
  /** 成功率 */
  successRate: string;
  /** 成功率较昨日变化 */
  successRateTrend: number;
  /** 待处理异常数 */
  pendingExceptionCount: number;
  /** 异常较昨日变化 */
  exceptionTrend: number;
  /** 最近全量同步时间 */
  latestFullSyncTime: string;
  /** 最近全量同步较昨日提前/延后分钟数 */
  latestFullSyncTrendMinutes: number;
}

export interface SyncHealthData {
  failed: { count: number; rate: number };
  inProgress: { count: number; rate: number };
  pending: { count: number; rate: number };
  success: { count: number; rate: number };
}

export interface SyncConfigData {
  dataSource: { connected: boolean; name: string };
  incrementalMode: string;
  lastFullSync: string;
  nextFullSync: string;
  scheduleFrequency: string;
  syncScope: string;
}

export const SYNC_OBJECT_META: Record<SyncObject, string> = {
  department: "部门",
  organization: "组织架构",
  user: "用户",
  user_binding: "用户绑定",
};

export const SYNC_TYPE_META: Record<
  SyncTaskType,
  { color: string; text: string }
> = {
  compensation: { color: "#fa8c16", text: "补偿" },
  full: { color: "#1677ff", text: "全量" },
  incremental: { color: "#52c41a", text: "增量" },
  pending: { color: "#bfbfbf", text: "待执行" },
  validation: { color: "#722ed1", text: "校验" },
};

export const SYNC_STATUS_META: Record<
  SyncTaskStatus,
  { color: string; text: string }
> = {
  failed: { color: "error", text: "失败" },
  pending: { color: "default", text: "待执行" },
  success: { color: "success", text: "成功" },
};

export const SYNC_ALERT_STATUS_META: Record<
  SyncAlertStatus,
  { color: string; text: string }
> = {
  processing: { color: "warning", text: "处理中" },
  unprocessed: { color: "error", text: "未处理" },
};

/** 同步任务类型 → 图标名称（严格使用 @ant-design/icons 已有图标）。 */
export const SYNC_TASK_ICON_META: Record<
  SyncObject,
  { color: string; iconName: string }
> = {
  department: { color: "#1677ff", iconName: "ApartmentOutlined" },
  organization: { color: "#722ed1", iconName: "ApartmentOutlined" },
  user: { color: "#52c41a", iconName: "UserOutlined" },
  user_binding: { color: "#fa8c16", iconName: "SafetyCertificateOutlined" },
};

/** 与设计图一致的 12 条最近同步任务。 */
/** 筛选状态聚合为单一对象。 */
export interface SyncFilterValue {
  searchText: string;
  status: SyncTaskStatus | undefined;
  type: SyncTaskType | undefined;
}

export function createDefaultSyncFilters(): SyncFilterValue {
  return {
    searchText: "",
    status: undefined,
    type: undefined,
  };
}

export function filterSyncRows(
  rows: SyncTaskSummary[],
  filters: SyncFilterValue,
): SyncTaskSummary[] {
  return rows.filter((row) => {
    const matchesSearch =
      !filters.searchText ||
      row.taskName.toLowerCase().includes(filters.searchText.toLowerCase()) ||
      SYNC_OBJECT_META[row.object].includes(filters.searchText);
    const matchesType = !filters.type || row.taskType === filters.type;
    const matchesStatus = !filters.status || row.status === filters.status;
    return matchesSearch && matchesType && matchesStatus;
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

export function formatTrend(value: number, unit = ""): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${unit}`;
}
