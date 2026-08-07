import { Alert, Button, Skeleton, Typography } from "antd";
import { lazy, Suspense, useMemo } from "react";

import { EmptyBlock } from "../../components/common/EmptyBlock";
import { useDashboard } from "../../modules/analytics/useAnalytics";

const ReactECharts = lazy(() => import("echarts-for-react"));

const { Text, Title } = Typography;

function prefersReducedMotion(): boolean {
  return (
    globalThis.window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false
  );
}

/** 本月应用使用趋势折线图：数据源为 application 仪表盘，按日聚合。 */
export function CreatorTrendChart() {
  const { data, error, isError, isPending, refetch } =
    useDashboard("application");

  const { days, values, total } = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const metric of data?.metrics ?? []) {
      byDay.set(metric.day, (byDay.get(metric.day) ?? 0) + metric.value);
    }
    const sortedDays = [...byDay.keys()].sort();
    return {
      days: sortedDays,
      total: sortedDays.reduce((sum, day) => sum + (byDay.get(day) ?? 0), 0),
      values: sortedDays.map((day) => byDay.get(day) ?? 0),
    };
  }, [data]);

  return (
    <section
      aria-label="本月应用使用趋势"
      className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <Title level={3} className="!mb-0 !text-base">
          本月应用使用趋势
        </Title>
        {data ? (
          <Text style={{ color: "#8c8c8c", fontSize: 12 }} type="secondary">
            累计 {total} 次使用
          </Text>
        ) : null}
      </div>
      {isPending ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
      {isError ? (
        <Alert
          action={
            <Button onClick={() => void refetch()} size="small">
              重试
            </Button>
          }
          description={error.message}
          showIcon
          title="趋势数据加载失败"
          type="error"
        />
      ) : null}
      {data && days.length === 0 ? (
        <EmptyBlock description="本月暂无应用使用数据" />
      ) : null}
      {data && days.length > 0 ? (
        <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
          <ReactECharts
            notMerge
            option={{
              animation: !prefersReducedMotion(),
              grid: { bottom: 24, left: 48, right: 16, top: 16 },
              series: [
                {
                  areaStyle: { opacity: 0.08 },
                  data: values,
                  itemStyle: { color: "#1677ff" },
                  lineStyle: { color: "#1677ff", width: 2 },
                  name: "使用次数",
                  smooth: true,
                  type: "line",
                },
              ],
              tooltip: { trigger: "axis" },
              xAxis: {
                axisLabel: { color: "#8c8c8c" },
                data: days,
                type: "category",
              },
              yAxis: {
                axisLabel: { color: "#8c8c8c" },
                type: "value",
              },
            }}
            style={{ height: 240 }}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
