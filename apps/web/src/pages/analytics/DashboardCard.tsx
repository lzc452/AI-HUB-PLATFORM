import { Spin, Tag, Typography } from "antd";
import ReactECharts from "echarts-for-react";

import type { DashboardKey } from "../../modules/analytics/analytics.client";
import { useDashboard } from "../../modules/analytics/useAnalytics";

const { Text, Title } = Typography;

export interface DashboardCardProps {
  dashboardKey: DashboardKey;
  description: string;
  title: string;
}

function prefersReducedMotion(): boolean {
  return (
    globalThis.window
      .matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false
  );
}

export function DashboardCard({
  dashboardKey,
  description,
  title,
}: DashboardCardProps) {
  const { data, isPending } = useDashboard(dashboardKey);

  const total =
    data?.metrics.reduce((sum, metric) => sum + metric.value, 0) ?? 0;
  const byDay = new Map<string, number>();
  for (const metric of data?.metrics ?? []) {
    byDay.set(metric.day, (byDay.get(metric.day) ?? 0) + metric.value);
  }
  const days = [...byDay.keys()].sort();

  return (
    <article
      className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
      aria-label={`${title} dashboard`}
    >
      <Title level={3} className="!mb-2">
        {title}
      </Title>
      <Text type="secondary">{description}</Text>
      <div className="mt-4">
        <Tag color="blue">Daily aggregate</Tag>
        <Tag>180-day rebuild</Tag>
      </div>
      {isPending ? <Spin aria-label={`${title} 数据加载中`} /> : null}
      {data ? (
        <>
          <Title level={2} className="!mb-0 !mt-3">
            {total}
          </Title>
          <Text type="secondary">聚合计值（按日）</Text>
          {days.length > 0 ? (
            <ReactECharts
              notMerge
              option={{
                animation: !prefersReducedMotion(),
                grid: { bottom: 24, left: 48, right: 16, top: 16 },
                series: [
                  {
                    data: days.map((day) => byDay.get(day) ?? 0),
                    type: "bar",
                  },
                ],
                tooltip: { trigger: "axis" },
                xAxis: { data: days, type: "category" },
                yAxis: { type: "value" },
              }}
              style={{ height: 160 }}
            />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
