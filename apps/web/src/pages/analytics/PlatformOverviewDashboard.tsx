import {
  AppstoreAddOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  FileTextOutlined,
  FlagOutlined,
  MinusOutlined,
  MoneyCollectOutlined,
  ScanOutlined,
  ScheduleOutlined,
  SendOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Select, Skeleton, Table, Tag, Typography } from "antd";
import { lazy, Suspense, useMemo, useState } from "react";

import { KpiMetricCard } from "../../components/common";
import { EmptyBlock } from "../../components/common/EmptyBlock";
import { ErrorBlock } from "../../components/common/ErrorBlock";
import { usePlatformOverview } from "../../modules/analytics/usePlatformOverview";

const ReactECharts = lazy(() => import("echarts-for-react"));

const { Text, Title } = Typography;

function prefersReducedMotion(): boolean {
  return (
    globalThis.window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false
  );
}

const kpiIcons: Record<string, React.ReactNode> = {
  上架应用: <AppstoreAddOutlined aria-hidden="true" />,
  待审核任务: <AuditOutlined aria-hidden="true" />,
  待认领需求: <FlagOutlined aria-hidden="true" />,
  月活员工: <UserOutlined aria-hidden="true" />,
  活跃应用: <AppstoreOutlined aria-hidden="true" />,
  交付总数: <SendOutlined aria-hidden="true" />,
};

const appIconMap: Record<string, React.ComponentType> = {
  BarChartOutlined,
  FileTextOutlined,
  MoneyCollectOutlined,
  ScanOutlined,
  ScheduleOutlined,
};

const trendMetaMap = {
  down: { color: "#f5222d", icon: CaretDownOutlined },
  flat: { color: "#8c8c8c", icon: MinusOutlined },
  up: { color: "#52c41a", icon: CaretUpOutlined },
};

export function PlatformOverviewDashboard() {
  const { data, error, isError, isPending } = usePlatformOverview();
  const [deliveryGranularity, setDeliveryGranularity] = useState("day");

  if (isPending) {
    return <PlatformOverviewSkeleton />;
  }

  if (isError) {
    return (
      <ErrorBlock
        description={error?.message ?? "平台总览数据加载失败"}
        title="加载失败"
      />
    );
  }

  if (!data) {
    return <EmptyBlock description="暂无平台总览数据" />;
  }

  return (
    <div className="space-y-2">
      {/* KPI 指标 */}
      <section
        aria-label="核心指标"
        className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"
      >
        {data.kpiMetrics.map((metric, index) => (
          <KpiMetricCard
            icon={kpiIcons[metric.label] ?? <TeamOutlined aria-hidden="true" />}
            iconBackground={metric.iconBackground}
            iconColor={metric.iconColor}
            index={index}
            key={metric.label}
            label={metric.label}
            trend={metric.trend}
            value={metric.value.toLocaleString("zh-CN")}
          />
        ))}
      </section>

      {/* 交付趋势 + 部门使用热力 */}
      <section
        aria-label="趋势与热力"
        className="grid grid-cols-1 gap-3 xl:grid-cols-12"
      >
        <div
          className="dashboard-panel dash-rise rounded-xl  bg-white p-4 xl:col-span-7"
          style={{ animationDelay: "300ms" }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <Title className="!m-0" level={5}>
              交付趋势
            </Title>
            <Select
              aria-label="交付趋势粒度"
              defaultValue="day"
              onChange={setDeliveryGranularity}
              options={[
                { label: "按日", value: "day" },
                { label: "按周", value: "week" },
              ]}
              size="small"
              value={deliveryGranularity}
            />
          </div>
          <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
            <DeliveryTrendChart data={data.deliveryTrend} />
          </Suspense>
          <Text className="mt-2 block text-xs text-[#8c8c8c]">
            数据口径：近30天平台聚合数据
          </Text>
        </div>

        <div
          className="dashboard-panel dash-rise rounded-xl  bg-white p-4 xl:col-span-5"
          style={{ animationDelay: "360ms" }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <Title className="!m-0" level={5}>
              部门使用热力
            </Title>
            <div className="flex items-center gap-2 text-xs text-[#8c8c8c]">
              <span>低</span>
              <span
                aria-hidden="true"
                className="h-2 w-16 rounded-sm"
                style={{
                  background:
                    "linear-gradient(90deg, #e0f0f0 0%, #0060f0 100%)",
                }}
              />
              <span>高</span>
            </div>
          </div>
          <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
            <div className="flex gap-4">
              <DepartmentHeatmap data={data.departmentHeatmap} />
              <DepartmentHeatmapTotals data={data.departmentHeatmap} />
            </div>
          </Suspense>
          <Text className="mt-2 block text-xs text-[#8c8c8c]">
            数据口径：近30天平台聚合数据（使用次数）
          </Text>
        </div>
      </section>

      {/* 应用排行 + 需求状态漏斗 */}
      <section
        aria-label="排行与漏斗"
        className="grid grid-cols-1 gap-3 xl:grid-cols-2"
      >
        <div
          className="dashboard-panel dash-rise rounded-xl  bg-white p-4"
          style={{ animationDelay: "420ms" }}
        >
          <Title className="!m-0 mb-4" level={5}>
            应用排行（Top 5）
          </Title>
          <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
            <AppRankingChart data={data.appRanking} />
          </Suspense>
          <Text className="mt-2 block text-xs text-[#8c8c8c]">
            数据口径：近30天平台聚合数据
          </Text>
        </div>

        <div
          className="dashboard-panel dash-rise rounded-xl  bg-white p-4"
          style={{ animationDelay: "460ms" }}
        >
          <Title className="!m-0 mb-4" level={5}>
            需求状态漏斗
          </Title>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
              <DemandFunnelChart data={data.demandFunnel} />
            </Suspense>
            <div>
              <Text className="mb-2 block text-sm text-[#595959]">
                阶段转化率
              </Text>
              <ConversionRateTable data={data.conversionRates} />
            </div>
          </div>
          <Text className="mt-2 block text-xs text-[#8c8c8c]">
            数据口径：近30天平台聚合数据
          </Text>
        </div>
      </section>

      {/* 审核治理 SLA + 最近告警 */}
      <section
        aria-label="治理与告警"
        className="grid grid-cols-1 gap-3 xl:grid-cols-2"
      >
        <div
          className="dashboard-panel dash-rise rounded-xl  bg-white p-4"
          style={{ animationDelay: "520ms" }}
        >
          <Title className="!m-0 mb-4" level={5}>
            审核治理（SLA 概览）
          </Title>
          <SlaTable data={data.slaPolicies} />
          <Text className="mt-2 block text-xs text-[#8c8c8c]">
            数据口径：近30天平台聚合数据
          </Text>
        </div>

        <div
          className="dashboard-panel dash-rise rounded-xl  bg-white p-4"
          style={{ animationDelay: "560ms" }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <Title className="!m-0" level={5}>
              最近告警 / 说明
            </Title>
            <Button type="link">查看全部</Button>
          </div>
          <AlertsList data={data.alerts} />
          <Text className="mt-2 block text-xs text-[#8c8c8c]">
            数据口径：近30天平台聚合数据
          </Text>
        </div>
      </section>
    </div>
  );
}

function PlatformOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="rounded-xl  bg-white p-4" key={index}>
            <Skeleton active paragraph={{ rows: 2 }} title={false} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-xl  bg-white p-4 xl:col-span-7">
          <Skeleton active paragraph={{ rows: 6 }} title />
        </div>
        <div className="rounded-xl  bg-white p-4 xl:col-span-5">
          <Skeleton active paragraph={{ rows: 6 }} title />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl  bg-white p-4">
          <Skeleton active paragraph={{ rows: 6 }} title />
        </div>
        <div className="rounded-xl  bg-white p-4">
          <Skeleton active paragraph={{ rows: 6 }} title />
        </div>
      </div>
    </div>
  );
}

function DeliveryTrendChart({
  data,
}: {
  data: Array<{ date: string; value: number }>;
}) {
  return (
    <ReactECharts
      notMerge
      option={{
        animation: !prefersReducedMotion(),
        grid: { bottom: 24, left: 48, right: 24, top: 16 },
        series: [
          {
            areaStyle: {
              color: {
                colorStops: [
                  { color: "rgba(0, 96, 240, 0.25)", offset: 0 },
                  { color: "rgba(0, 96, 240, 0.02)", offset: 1 },
                ],
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
              },
            },
            data: data.map((item) => item.value),
            itemStyle: { color: "#0060f0" },
            lineStyle: { color: "#0060f0", width: 2 },
            name: "交付数量",
            smooth: true,
            type: "line",
          },
        ],
        tooltip: {
          axisPointer: { lineStyle: { color: "#0060f0", type: "dashed" } },
          trigger: "axis",
        },
        xAxis: {
          axisLabel: { color: "#8c8c8c" },
          axisLine: { lineStyle: { color: "#d9d9d9" } },
          data: data.map((item) => item.date),
          type: "category",
        },
        yAxis: {
          axisLabel: { color: "#8c8c8c" },
          max: 100,
          name: "交付数量（个）",
          nameTextStyle: { color: "#8c8c8c", padding: [0, 0, 0, -36] },
          splitLine: { lineStyle: { color: "#f0f0f0" } },
          type: "value",
        },
      }}
      style={{ height: 160 }}
    />
  );
}

function DepartmentHeatmap({
  data,
}: {
  data: Array<{ department: string; usage: number; week: string }>;
}) {
  const weeks = useMemo(
    () => Array.from(new Set(data.map((d) => d.week))),
    [data],
  );
  const departments = useMemo(
    () => Array.from(new Set(data.map((d) => d.department))).reverse(),
    [data],
  );
  const maxUsage = useMemo(() => Math.max(...data.map((d) => d.usage)), [data]);
  const seriesData = useMemo(
    () =>
      data.map((d) => [d.week, d.department, d.usage]) as Array<
        [string, string, number]
      >,
    [data],
  );

  return (
    <ReactECharts
      notMerge
      option={{
        animation: !prefersReducedMotion(),
        grid: { bottom: 24, left: 80, right: 16, top: 16 },
        series: [
          {
            data: seriesData,
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.2)" },
            },
            itemStyle: {
              borderColor: "#ffffff",
              borderWidth: 2,
              borderRadius: 4,
            },
            label: { show: true, color: "#1f1f1f", fontSize: 11 },
            name: "使用次数",
            type: "heatmap",
          },
        ],
        tooltip: { position: "top" },
        visualMap: {
          calculable: false,
          inRange: { color: ["#e0f0f0", "#70a0f0", "#0060f0"] },
          max: maxUsage,
          min: 0,
          show: false,
        },
        xAxis: {
          axisLabel: { color: "#8c8c8c" },
          data: weeks,
          splitArea: { show: false },
          type: "category",
        },
        yAxis: {
          axisLabel: { color: "#1f1f1f" },
          data: departments,
          splitArea: { show: false },
          type: "category",
        },
      }}
      className="min-w-0 flex-1"
      style={{ height: 130 }}
    />
  );
}

function DepartmentHeatmapTotals({
  data,
}: {
  data: Array<{ department: string; usage: number; week: string }>;
}) {
  const latestWeekTotals = useMemo(() => {
    const weeks = Array.from(new Set(data.map((d) => d.week))).sort();
    const latestWeek = weeks[weeks.length - 1] ?? "";
    const departments = Array.from(new Set(data.map((d) => d.department)));
    return departments.map((department) => {
      const cell = data.find(
        (d) => d.department === department && d.week === latestWeek,
      );
      return { department, usage: cell?.usage ?? 0 };
    });
  }, [data]);

  return (
    <div className="w-20 shrink-0">
      <Text className="mb-2 block text-center text-xs text-[#8c8c8c]">
        总使用次数
      </Text>
      <ul className="space-y-2">
        {latestWeekTotals.map(({ department, usage }) => (
          <li className="text-right" key={department}>
            <span className="block text-sm font-medium text-[#1f1f1f]">
              {usage}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppRankingChart({
  data,
}: {
  data: Array<{ icon: string; iconColor: string; name: string; value: number }>;
}) {
  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)), [data]);

  return (
    <ul className="space-y-3">
      {data.map((item) => {
        const Icon = appIconMap[item.icon] ?? BarChartOutlined;
        return (
          <li className="flex items-center gap-3" key={item.name}>
            <Icon
              aria-hidden="true"
              className="shrink-0 text-lg"
              style={{ color: item.iconColor }}
            />
            <span className="w-28 shrink-0 text-sm text-[#1f1f1f]">
              {item.name}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="h-3 rounded-r-full transition-[filter] duration-200 hover:brightness-110"
                style={{
                  backgroundColor: "#0060f0",
                  width: `${(item.value / maxValue) * 100}%`,
                }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-sm font-medium text-[#1f1f1f]">
              {item.value.toLocaleString("zh-CN")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const funnelColors = ["#0060f0", "#2f7df0", "#5a9af3", "#86b6f6", "#b2d2fa"];

function DemandFunnelChart({
  data,
}: {
  data: Array<{ count: number; name: string }>;
}) {
  return (
    <ReactECharts
      notMerge
      option={{
        animation: !prefersReducedMotion(),
        color: funnelColors,
        series: [
          {
            data: data.map((item, index) => ({
              itemStyle: { color: funnelColors[index % funnelColors.length] },
              value: item.count,
            })),
            funnelAlign: "center",
            gap: 2,
            label: {
              color: "#fff",
              formatter: "{b}\n{c}",
              show: true,
            },
            left: "10%",
            maxSize: "80%",
            minSize: "20%",
            right: "10%",
            sort: "descending",
            type: "funnel",
          },
        ],
        tooltip: { trigger: "item" },
      }}
    />
  );
}

function ConversionRateTable({
  data,
}: {
  data: Array<{ change: number; rate: number; stage: string }>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[#8c8c8c]">
          <th className="pb-2 font-medium">阶段</th>
          <th className="pb-2 font-medium">转化率</th>
          <th className="pb-2 font-medium">较上周期</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => {
          const direction: "up" | "down" | "flat" =
            item.change > 0 ? "up" : item.change < 0 ? "down" : "flat";
          const meta = trendMetaMap[direction];
          const Icon = meta.icon;
          return (
            <tr className="border-t border-[#f0f0f0]" key={item.stage}>
              <td className="py-1.5 text-[#1f1f1f]">{item.stage}</td>
              <td className="py-1.5 font-medium text-[#1f1f1f]">
                {item.rate.toFixed(1)}%
              </td>
              <td className="py-1.5">
                <span
                  className="flex items-center gap-1"
                  style={{ color: meta.color }}
                >
                  <Icon aria-hidden="true" className="text-xs" />
                  {item.change > 0 ? "+" : ""}
                  {item.change.toFixed(1)}%
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SlaTable({
  data,
}: {
  data: Array<{
    name: string;
    overdue: number;
    passRate: number;
    pending: number;
    trend: { direction: "down" | "flat" | "up"; value: number };
  }>;
}) {
  const columns = [
    { dataIndex: "name", title: "SLA 策略" },
    { align: "center" as const, dataIndex: "pending", title: "待审核数量" },
    { align: "center" as const, dataIndex: "overdue", title: "超时数" },
    {
      align: "center" as const,
      dataIndex: "passRate",
      render: (value: number) => `${value.toFixed(1)}%`,
      title: "通过率",
    },
    {
      align: "right" as const,
      dataIndex: "trend",
      render: (trend: { direction: "down" | "flat" | "up"; value: number }) => {
        if (trend.direction === "flat") {
          return (
            <span className="flex items-center justify-end gap-1 text-[#8c8c8c]">
              <MinusOutlined aria-hidden="true" className="text-xs" />
              {trend.value.toFixed(1)}%
            </span>
          );
        }
        const color = trend.direction === "up" ? "#52c41a" : "#f5222d";
        return (
          <span
            className="flex items-center justify-end gap-1"
            style={{ color }}
          >
            {trend.direction === "up" ? (
              <CaretUpOutlined aria-hidden="true" className="text-xs" />
            ) : (
              <CaretDownOutlined aria-hidden="true" className="text-xs" />
            )}
            {trend.value.toFixed(1)}%
          </span>
        );
      },
      title: "较上周期",
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data.map((item) => ({ ...item, key: item.name }))}
      pagination={false}
      size="small"
    />
  );
}

function AlertsList({
  data,
}: {
  data: Array<{
    content: string;
    id: string;
    time: string;
    type: "info" | "warning";
  }>;
}) {
  return (
    <ul className="space-y-3">
      {data.map((item) => (
        <li className="flex items-start gap-3" key={item.id}>
          <Tag
            className="m-0 shrink-0"
            color={item.type === "warning" ? "warning" : "blue"}
          >
            {item.type === "warning" ? "告警" : "提示"}
          </Tag>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm leading-relaxed text-[#1f1f1f]">
              {item.content}
            </p>
            <Text className="text-xs text-[#8c8c8c]">{item.time}</Text>
          </div>
        </li>
      ))}
    </ul>
  );
}
