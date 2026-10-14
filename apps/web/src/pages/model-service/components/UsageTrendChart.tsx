import { Skeleton } from "antd";
import { lazy, Suspense, useMemo } from "react";

import type { DailyUsage } from "../../../modules/model-service";

const ReactECharts = lazy(() => import("echarts-for-react"));

function prefersReducedMotion(): boolean {
  return (
    globalThis.window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false
  );
}

export interface UsageTrendChartProps {
  daily: DailyUsage[];
}

/**
 * 日趋势：调用次数（柱）+ token 合计（折线，右轴）。
 * 双轴是因为两者量纲差 3~5 个数量级，单轴会把调用次数压成一条直线。
 */
export function UsageTrendChart({ daily }: UsageTrendChartProps) {
  const { days, callSeries, tokenSeries } = useMemo(() => {
    const sorted = [...daily].sort((a, b) =>
      a.usageDate.localeCompare(b.usageDate),
    );
    return {
      days: sorted.map((row) => row.usageDate.slice(5)), // MM-DD
      callSeries: sorted.map((row) => row.calls),
      tokenSeries: sorted.map((row) => row.totalTokens),
    };
  }, [daily]);

  return (
    <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
      <ReactECharts
        notMerge
        option={{
          animation: !prefersReducedMotion(),
          grid: { bottom: 28, left: 56, right: 64, top: 32 },
          legend: { textStyle: { color: "#8c8c8c" }, top: 0 },
          series: [
            {
              barMaxWidth: 24,
              data: callSeries,
              itemStyle: { color: "#1677ff" },
              name: "调用次数",
              type: "bar",
            },
            {
              data: tokenSeries,
              itemStyle: { color: "#fa8c16" },
              lineStyle: { color: "#fa8c16", width: 2 },
              name: "Token 合计",
              smooth: true,
              type: "line",
              yAxisIndex: 1,
            },
          ],
          tooltip: { trigger: "axis" },
          xAxis: {
            axisLabel: { color: "#8c8c8c" },
            data: days,
            type: "category",
          },
          yAxis: [
            {
              axisLabel: { color: "#8c8c8c" },
              name: "调用",
              type: "value",
            },
            {
              axisLabel: { color: "#8c8c8c" },
              name: "Token",
              splitLine: { show: false },
              type: "value",
            },
          ],
        }}
        style={{ height: 280 }}
      />
    </Suspense>
  );
}
