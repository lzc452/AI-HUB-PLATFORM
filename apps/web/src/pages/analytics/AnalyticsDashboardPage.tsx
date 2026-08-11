import { DownloadOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Tabs, Typography } from "antd";
import { useMemo, useState } from "react";

import { aiHubTheme } from "@ai-hub/ui";
import {
  DASHBOARD_PERMISSIONS,
  type DashboardKey,
} from "../../modules/analytics/analytics.client";
import { hasPermission } from "../../modules/auth/roles";
import { useAuth } from "../../modules/auth/useAuth";
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
            <PlatformOverviewDashboard />
          ) : (
            <section aria-label={tab.label} className="pt-4">
              <DashboardCard
                dashboardKey={tab.dashboardKey}
                description={tab.description}
                title={tab.label}
              />
            </section>
          ),
        key: tab.key,
        label: tab.label,
      })),
    [visibleTabs],
  );

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
              <Button icon={<DownloadOutlined aria-hidden="true" />}>
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
