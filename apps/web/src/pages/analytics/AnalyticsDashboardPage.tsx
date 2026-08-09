import { Alert, Typography } from "antd";

import {
  DASHBOARD_PERMISSIONS,
  type DashboardKey,
} from "../../modules/analytics/analytics.client";
import { hasPermission } from "../../modules/auth/roles";
import { useAuth } from "../../modules/auth/useAuth";
import { DashboardCard } from "./DashboardCard";

const { Title } = Typography;

const fixedAnalyticsDashboards: ReadonlyArray<{
  dashboardKey: DashboardKey;
  description: string;
  title: string;
}> = [
  {
    dashboardKey: "platform",
    description: "应用访问与采用聚合",
    title: "平台总览",
  },
  {
    dashboardKey: "market",
    description: "已发布交付聚合",
    title: "市场采用分析",
  },
  {
    dashboardKey: "application",
    description: "不包含访问名单的下载聚合",
    title: "应用组合分析",
  },
  {
    dashboardKey: "innovation",
    description: "受众过滤的需求聚合",
    title: "创新需求漏斗",
  },
  {
    dashboardKey: "review",
    description: "审核决策聚合",
    title: "审核治理",
  },
  {
    dashboardKey: "department",
    description: "部门维度的需求聚合",
    title: "部门采用",
  },
  {
    dashboardKey: "risk",
    description: "举报互动聚合",
    title: "风险治理",
  },
  {
    dashboardKey: "runtime",
    description: "通知队列聚合",
    title: "系统运行",
  },
  {
    dashboardKey: "integration",
    description: "助手请求聚合",
    title: "集成质量",
  },
];

export default function AnalyticsDashboardPage() {
  const { actor } = useAuth();
  const visibleDashboards = fixedAnalyticsDashboards.filter((dashboard) =>
    hasPermission(actor, DASHBOARD_PERMISSIONS[dashboard.dashboardKey]),
  );

  return (
    <div className="space-y-4">
      <Title className="!mb-0" level={1}>
        数据看板
      </Title>
      <Alert
        description="每个指标声明其来源事件、公式、时间范围、权限、受众规则与重算方式；指标可由保留的原始事件重建。"
        showIcon
        title="只读聚合边界"
        type="info"
      />
      <section
        aria-label="固定数据看板"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {visibleDashboards.map((dashboard) => (
          <DashboardCard
            dashboardKey={dashboard.dashboardKey}
            description={dashboard.description}
            key={dashboard.dashboardKey}
            title={dashboard.title}
          />
        ))}
      </section>
    </div>
  );
}
