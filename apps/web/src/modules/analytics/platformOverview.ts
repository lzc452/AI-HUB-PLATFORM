export interface KpiMetric {
  iconBackground: string;
  iconColor: string;
  label: string;
  trend: { direction: "down" | "flat" | "up"; value: number };
  value: number;
}

export interface DeliveryTrendPoint {
  date: string;
  value: number;
}

export interface DepartmentHeatmapCell {
  department: string;
  usage: number;
  week: string;
}

export interface AppRankingItem {
  icon: string;
  iconColor: string;
  name: string;
  value: number;
}

export interface DemandFunnelStage {
  count: number;
  name: string;
}

export interface ConversionRate {
  change: number;
  rate: number;
  stage: string;
}

export interface SlaPolicy {
  name: string;
  overdue: number;
  passRate: number;
  pending: number;
  trend: { direction: "down" | "flat" | "up"; value: number };
}

export interface AlertItem {
  content: string;
  id: string;
  time: string;
  type: "info" | "warning";
}

export interface PlatformOverviewData {
  alerts: AlertItem[];
  appRanking: AppRankingItem[];
  conversionRates: ConversionRate[];
  deliveryTrend: DeliveryTrendPoint[];
  departmentHeatmap: DepartmentHeatmapCell[];
  demandFunnel: DemandFunnelStage[];
  kpiMetrics: KpiMetric[];
  slaPolicies: SlaPolicy[];
}

export function getPlatformOverviewData(): Promise<PlatformOverviewData> {
  return Promise.resolve({
    alerts: [
      {
        content: "需求【智能预算分析助手】已超时 2 天未评估，请及时处理。",
        id: "1",
        time: "2026-06-08 09:15",
        type: "warning",
      },
      {
        content: "应用【会议纪要助手】验收任务已超时 1 天，请关注。",
        id: "2",
        time: "2026-06-08 08:42",
        type: "warning",
      },
      {
        content: "本周交付量较上周期增长 18.7%，继续保持。",
        id: "3",
        time: "2026-06-08 08:30",
        type: "info",
      },
      {
        content: "数据更新说明：本看板数据每日 08:00 自动更新。",
        id: "4",
        time: "2026-06-08 08:00",
        type: "info",
      },
    ],
    appRanking: [
      { icon: "FileTextOutlined", iconColor: "#0060f0", name: "智能合同审查", value: 1248 },
      { icon: "ScanOutlined", iconColor: "#13c2c2", name: "OCR票据识别", value: 1036 },
      { icon: "MoneyCollectOutlined", iconColor: "#52c41a", name: "智能报销助手", value: 892 },
      { icon: "ScheduleOutlined", iconColor: "#faad14", name: "会议纪要助手", value: 742 },
      { icon: "BarChartOutlined", iconColor: "#722ed1", name: "数据分析助手", value: 615 },
    ],
    conversionRates: [
      { change: -14.3, rate: 70.2, stage: "待认领" },
      { change: 8.9, rate: 61.0, stage: "评估中" },
      { change: 4.2, rate: 50.0, stage: "开发中" },
      { change: -8.0, rate: 66.7, stage: "待验收" },
      { change: 16.0, rate: 14.3, stage: "已完成" },
    ],
    deliveryTrend: [
      { date: "05-09", value: 34 },
      { date: "05-10", value: 38 },
      { date: "05-11", value: 42 },
      { date: "05-12", value: 39 },
      { date: "05-13", value: 45 },
      { date: "05-14", value: 48 },
      { date: "05-15", value: 52 },
      { date: "05-16", value: 49 },
      { date: "05-17", value: 44 },
      { date: "05-18", value: 41 },
      { date: "05-19", value: 46 },
      { date: "05-20", value: 50 },
      { date: "05-21", value: 55 },
      { date: "05-22", value: 49 },
      { date: "05-23", value: 58 },
      { date: "05-24", value: 62 },
      { date: "05-25", value: 65 },
      { date: "05-26", value: 61 },
      { date: "05-27", value: 58 },
      { date: "05-28", value: 64 },
      { date: "05-29", value: 69 },
      { date: "05-30", value: 72 },
      { date: "05-31", value: 68 },
      { date: "06-01", value: 74 },
      { date: "06-02", value: 71 },
      { date: "06-03", value: 76 },
      { date: "06-04", value: 73 },
      { date: "06-05", value: 69 },
      { date: "06-06", value: 75 },
    ],
    departmentHeatmap: [
      { department: "财务部", usage: 186, week: "05-09~05-15" },
      { department: "行政部", usage: 148, week: "05-09~05-15" },
      { department: "研发部", usage: 132, week: "05-09~05-15" },
      { department: "市场部", usage: 98, week: "05-09~05-15" },
      { department: "人力资源部", usage: 72, week: "05-09~05-15" },
      { department: "财务部", usage: 192, week: "05-16~05-22" },
      { department: "行政部", usage: 154, week: "05-16~05-22" },
      { department: "研发部", usage: 138, week: "05-16~05-22" },
      { department: "市场部", usage: 102, week: "05-16~05-22" },
      { department: "人力资源部", usage: 78, week: "05-16~05-22" },
      { department: "财务部", usage: 178, week: "05-23~05-29" },
      { department: "行政部", usage: 146, week: "05-23~05-29" },
      { department: "研发部", usage: 128, week: "05-23~05-29" },
      { department: "市场部", usage: 94, week: "05-23~05-29" },
      { department: "人力资源部", usage: 70, week: "05-23~05-29" },
      { department: "财务部", usage: 186, week: "05-30~06-06" },
      { department: "行政部", usage: 148, week: "05-30~06-06" },
      { department: "研发部", usage: 132, week: "05-30~06-06" },
      { department: "市场部", usage: 98, week: "05-30~06-06" },
      { department: "人力资源部", usage: 72, week: "05-30~06-06" },
    ],
    demandFunnel: [
      { count: 168, name: "待认领" },
      { count: 118, name: "评估中" },
      { count: 72, name: "开发中" },
      { count: 36, name: "待验收" },
      { count: 24, name: "已完成" },
    ],
    kpiMetrics: [
      { iconBackground: "#e6f4ff", iconColor: "#0060f0", label: "月活员工", trend: { direction: "up", value: 12.6 }, value: 285 },
      { iconBackground: "#f6ffed", iconColor: "#52c41a", label: "活跃应用", trend: { direction: "up", value: 5.0 }, value: 42 },
      { iconBackground: "#f9f0ff", iconColor: "#722ed1", label: "交付总数", trend: { direction: "up", value: 18.7 }, value: 1024 },
      { iconBackground: "#fff7e6", iconColor: "#fa8c16", label: "上架应用", trend: { direction: "up", value: 7.1 }, value: 30 },
      { iconBackground: "#fff1f0", iconColor: "#f5222d", label: "待审核任务", trend: { direction: "down", value: 16.7 }, value: 5 },
      { iconBackground: "#fffbe6", iconColor: "#fadb14", label: "待认领需求", trend: { direction: "up", value: 14.3 }, value: 12 },
    ],
    slaPolicies: [
      { name: "应用上架审核", overdue: 0, passRate: 98.7, pending: 3, trend: { direction: "up", value: 1.2 } },
      { name: "需求评估审核", overdue: 0, passRate: 96.5, pending: 2, trend: { direction: "up", value: 0.8 } },
      { name: "交付验收审核", overdue: 0, passRate: 100.0, pending: 0, trend: { direction: "flat", value: 0.0 } },
      { name: "安全合规审核", overdue: 0, passRate: 100.0, pending: 0, trend: { direction: "flat", value: 0.0 } },
    ],
  });
}
