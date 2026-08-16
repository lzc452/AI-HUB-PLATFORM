import { DownloadOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Tabs, Typography } from "antd";
import { useMemo, useState } from "react";

import { aiHubTheme } from "@ai-hub/ui";
import {
  createAnalyticsExport,
  DASHBOARD_PERMISSIONS,
  type AnalyticsDateRange,
  type DashboardKey,
} from "../../modules/analytics/analytics.client";
import { hasPermission } from "../../modules/auth/roles";
import { useAuth } from "../../modules/auth/useAuth";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";
import { DashboardCard } from "./DashboardCard";
import { PlatformOverviewDashboard } from "./PlatformOverviewDashboard";

const { Title } = Typography;

const dashboardTheme = {
  ...aiHubTheme,
  token: { ...aiHubTheme.token, colorPrimary: "#0060f0" },
};

interface DashboardTab {
  dashboardKey: DashboardKey;
  description: string;
  key: string;
  label: string;
}

const dashboardTabs: ReadonlyArray<DashboardTab> = [
  {
    dashboardKey: "platform",
    description: "应用访问与采用聚合",
    key: "platform",
    label: "平台总览",
  },
  {
    dashboardKey: "market",
    description: "已发布交付聚合",
    key: "market",
    label: "市场分析",
  },
  {
    dashboardKey: "application",
    description: "不包含访问名单的下载聚合",
    key: "application",
    label: "应用组合",
  },
  {
    dashboardKey: "innovation",
    description: "受众过滤的需求聚合",
    key: "innovation",
    label: "需求漏斗",
  },
  {
    dashboardKey: "department",
    description: "部门维度的需求聚合",
    key: "department",
    label: "部门贡献",
  },
  {
    dashboardKey: "risk",
    description: "举报互动聚合",
    key: "risk",
    label: "风险治理",
  },
];

const timeFilterOptions = [
  { label: "近7天", value: "7d" },
  { label: "近30天", value: "30d" },
  { label: "近90天", value: "90d" },
];

export default function AnalyticsDashboardPage() {
  const { actor } = useAuth();
  const [activeTab, setActiveTab] = useState("platform");
  const [timeFilter, setTimeFilter] = useState("30d");
  const [isExporting, setIsExporting] = useState(false);

  const range = useMemo<AnalyticsDateRange>(() => {
    const days = Number.parseInt(timeFilter.replace("d", ""), 10);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const format = (value: Date) => value.toISOString().slice(0, 10);
    return { from: format(from), to: format(to) };
  }, [timeFilter]);

  const visibleTabs = useMemo(
    () =>
      dashboardTabs.filter((tab) =>
        hasPermission(actor, DASHBOARD_PERMISSIONS[tab.dashboardKey]),
      ),
    [actor],
  );

  const tabItems = useMemo(
    () =>
      visibleTabs.map((tab) => ({
        children:
          tab.dashboardKey === "platform" ? (
            <PlatformOverviewDashboard range={range} />
          ) : (
            <section aria-label={tab.label} className="pt-4">
              <DashboardCard
                dashboardKey={tab.dashboardKey}
                description={tab.description}
                range={range}
                title={tab.label}
              />
            </section>
          ),
        key: tab.key,
        label: tab.label,
      })),
    [range, visibleTabs],
  );

  const handleExport = async () => {
    const target = (
      visibleTabs.find((tab) => tab.key === activeTab) ?? visibleTabs[0]
    )?.dashboardKey;
    if (!target) return;
    setIsExporting(true);
    try {
      const result = await createAnalyticsExport(target, range);
      const rows = [
        ["aggregateId", "occurredAt", "value", "requester"],
        ...result.rows.map((row) => [
          row.aggregateId,
          row.occurredAt,
          String(row.value),
          row.requester ?? "",
        ]),
      ];
      const csv = rows
        .map((row) => row.map((value) => JSON.stringify(value)).join(","))
        .join("\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `analytics-${target}-${range.from}-${range.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showSuccessMessage("分析数据已导出");
    } catch (error) {
      showErrorMessage(error, "分析数据导出失败");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ConfigProvider theme={dashboardTheme}>
      <div className="space-y-4 bg-white p-4 rounded-md">
        <Title className="!mb-0" level={1}>
          数据看板
        </Title>
        <Tabs
          activeKey={activeTab}
          className="analytics-dashboard-tabs"
          items={tabItems}
          onChange={setActiveTab}
          tabBarExtraContent={{
            left: undefined,
            right: (
              <div className="flex items-center gap-2">
                {timeFilterOptions.map((option) => (
                  <Button
                    aria-pressed={timeFilter === option.value}
                    className="dashboard-segment-button rounded px-3 py-1 text-sm transition-colors"
                    key={option.value}
                    type={timeFilter === option.value ? "primary" : "default"}
                    onClick={() => setTimeFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
                <Button
                  icon={<DownloadOutlined aria-hidden="true" />}
                  loading={isExporting}
                  onClick={handleExport}
                >
                  导出
                </Button>
              </div>
            ),
          }}
          tabBarGutter={24}
        />
      </div>
    </ConfigProvider>
  );
}
