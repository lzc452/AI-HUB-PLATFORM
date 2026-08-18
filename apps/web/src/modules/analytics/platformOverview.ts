import { getDashboard, type AnalyticsDateRange } from "./analytics.client";

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

export async function getPlatformOverviewData(
  range?: AnalyticsDateRange,
): Promise<PlatformOverviewData> {
  const result = await getDashboard("platform", range);
  const byMetric = new Map<string, number>();
  for (const item of result.metrics) {
    byMetric.set(
      item.metricKey,
      (byMetric.get(item.metricKey) ?? 0) + item.value,
    );
  }
  const metric = (
    label: string,
    key: string,
    color: string,
    background: string,
  ): KpiMetric => ({
    iconBackground: background,
    iconColor: color,
    label,
    trend: { direction: "flat", value: 0 },
    value: byMetric.get(key) ?? 0,
  });
  return {
    alerts: [],
    appRanking: [],
    conversionRates: [],
    deliveryTrend: result.metrics
      .filter((item) => item.metricKey === "platform.delivery_action_count")
      .map((item) => ({ date: item.day.slice(5), value: item.value })),
    departmentHeatmap: [],
    demandFunnel: [],
    kpiMetrics: [
      metric(
        "月活员工",
        "platform.active_employee_count",
        "#0060f0",
        "#e6f4ff",
      ),
      metric(
        "活跃应用",
        "platform.active_application_count",
        "#52c41a",
        "#f6ffed",
      ),
      metric(
        "交付总数",
        "platform.delivery_action_count",
        "#722ed1",
        "#f9f0ff",
      ),
      metric(
        "上架应用",
        "platform.published_application_count",
        "#fa8c16",
        "#fff7e6",
      ),
      metric(
        "待审核任务",
        "platform.pending_review_count",
        "#f5222d",
        "#fff1f0",
      ),
      metric(
        "待认领需求",
        "platform.pending_claim_count",
        "#fadb14",
        "#fffbe6",
      ),
      metric("转化需求", "demand.converted_count", "#13c2c2", "#e6fffb"),
      metric(
        "高风险应用",
        "risk.high_risk_application_count",
        "#eb2f96",
        "#fff0f6",
      ),
    ],
    slaPolicies: [],
  };
}
