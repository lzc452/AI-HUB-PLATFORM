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
export const SYNC_TASKS_MOCK_DATA: SyncTaskSummary[] = [
  {
    duration: "2分18秒",
    object: "organization",
    resultSummary: "同步256个部门，1,286个用户",
    startedAt: "2025-06-01 09:30:00",
    status: "success",
    taskId: "sync-001",
    taskName: "钉钉组织架构全量同步",
    taskType: "full",
  },
  {
    duration: "38秒",
    object: "user",
    resultSummary: "新增28，更新53",
    startedAt: "2025-06-01 09:25:12",
    status: "success",
    taskId: "sync-002",
    taskName: "用户增量同步",
    taskType: "incremental",
  },
  {
    duration: "1分05秒",
    object: "department",
    resultSummary: "失败3条，已回滚",
    startedAt: "2025-06-01 09:15:47",
    status: "failed",
    taskId: "sync-003",
    taskName: "部门变更补偿同步",
    taskType: "compensation",
  },
  {
    duration: "42秒",
    object: "user_binding",
    resultSummary: "校验45条，无异常",
    startedAt: "2025-06-01 09:10:20",
    status: "success",
    taskId: "sync-004",
    taskName: "首次登录绑定校验",
    taskType: "validation",
  },
  {
    duration: "26秒",
    object: "user",
    resultSummary: "待执行",
    startedAt: "2025-05-31 21:35:08",
    status: "pending",
    taskId: "sync-005",
    taskName: "手工补偿同步",
    taskType: "compensation",
  },
  {
    duration: "1分12秒",
    object: "organization",
    resultSummary: "同步250个部门，1,260个用户",
    startedAt: "2025-05-31 21:00:00",
    status: "success",
    taskId: "sync-006",
    taskName: "定时全量同步",
    taskType: "full",
  },
  {
    duration: "15秒",
    object: "user",
    resultSummary: "新增5，更新12",
    startedAt: "2025-05-31 20:45:33",
    status: "success",
    taskId: "sync-007",
    taskName: "用户增量同步",
    taskType: "incremental",
  },
  {
    duration: "33秒",
    object: "department",
    resultSummary: "补偿2条",
    startedAt: "2025-05-31 19:20:18",
    status: "success",
    taskId: "sync-008",
    taskName: "部门变更补偿同步",
    taskType: "compensation",
  },
  {
    duration: "55秒",
    object: "user_binding",
    resultSummary: "校验38条，无异常",
    startedAt: "2025-05-31 18:10:05",
    status: "success",
    taskId: "sync-009",
    taskName: "首次登录绑定校验",
    taskType: "validation",
  },
  {
    duration: "3分02秒",
    object: "organization",
    resultSummary: "同步248个部门，1,250个用户",
    startedAt: "2025-05-30 01:00:00",
    status: "success",
    taskId: "sync-010",
    taskName: "定时全量同步",
    taskType: "full",
  },
  {
    duration: "22秒",
    object: "user",
    resultSummary: "新增8，更新19",
    startedAt: "2025-05-29 09:15:22",
    status: "success",
    taskId: "sync-011",
    taskName: "用户增量同步",
    taskType: "incremental",
  },
  {
    duration: "18秒",
    object: "department",
    resultSummary: "补偿1条",
    startedAt: "2025-05-28 16:40:11",
    status: "success",
    taskId: "sync-012",
    taskName: "部门变更补偿同步",
    taskType: "compensation",
  },
];

/** 同步健康度图例数据。 */
export const SYNC_HEALTH_MOCK_DATA = {
  failed: { count: 15, rate: 1.2 },
  inProgress: { count: 2, rate: 0.2 },
  pending: { count: 3, rate: 0 },
  success: { count: 1256, rate: 98.6 },
};

/** 异常告警数据。 */
export const SYNC_ALERTS_MOCK_DATA: SyncAlertSummary[] = [
  {
    alertId: "alert-001",
    description: "最近失败原因：部门ID不存在或已删除",
    status: "unprocessed",
    time: "2025-06-01 09:15",
    title: "部门变更补偿同步失败",
  },
  {
    alertId: "alert-002",
    description: "最近失败原因：手机号重复",
    status: "processing",
    time: "2025-05-31 21:02",
    title: "用户增量同步部分失败",
  },
  {
    alertId: "alert-003",
    description: "延迟时间：3分28秒",
    status: "processing",
    time: "2025-05-31 19:45",
    title: "钉钉事件订阅延迟较高",
  },
];

/** 最近同步日志数据。 */
export const SYNC_LOGS_MOCK_DATA: SyncLogSummary[] = [
  {
    logId: "log-001",
    message: "钉钉组织架构全量同步任务执行成功",
    success: true,
    time: "09:30:00",
  },
  {
    logId: "log-002",
    message: "用户增量同步任务执行成功",
    success: true,
    time: "09:25:12",
  },
  {
    logId: "log-003",
    message: "部门变更补偿同步任务执行失败",
    success: false,
    time: "09:15:47",
  },
  {
    logId: "log-004",
    message: "首次登录绑定校验任务执行成功",
    success: true,
    time: "09:10:20",
  },
  {
    logId: "log-005",
    message: "开始执行用户增量同步任务",
    success: true,
    time: "09:05:13",
  },
];

/** 同步配置数据。 */
export const SYNC_CONFIG_MOCK_DATA = {
  dataSource: { connected: true, name: "钉钉" },
  incrementalMode: "事件订阅（部门/用户变更）",
  lastFullSync: "2025-06-01 09:30:00",
  nextFullSync: "2025-06-02 01:00:00",
  scheduleFrequency: "每日 01:00（全量）/ 事件驱动（增量）",
  syncScope: "全量组织架构与用户",
};

/** 顶部 KPI 统计数据。 */
export const SYNC_STATS_MOCK_DATA: SyncStatsSummary = {
  exceptionTrend: -1,
  latestFullSyncTime: "2025-06-01 09:30",
  latestFullSyncTrendMinutes: 10,
  pendingExceptionCount: 3,
  successRate: "98.6%",
  successRateTrend: 0.8,
  todayTaskCount: 12,
  todayTaskTrend: 4,
};

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
