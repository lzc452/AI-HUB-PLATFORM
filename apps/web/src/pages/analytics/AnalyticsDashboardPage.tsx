import { Alert, Typography } from "antd";

import type { DashboardKey } from "../../modules/analytics/analytics.client";
import { DashboardCard } from "./DashboardCard";

const { Paragraph, Text, Title } = Typography;

const fixedAnalyticsDashboards: ReadonlyArray<{
  dashboardKey: DashboardKey;
  description: string;
  title: string;
}> = [
  {
    dashboardKey: "platform",
    description: "Application views and adoption aggregates",
    title: "Platform",
  },
  {
    dashboardKey: "market",
    description: "Published delivery aggregates",
    title: "Market",
  },
  {
    dashboardKey: "application",
    description: "Download aggregates without access lists",
    title: "Application",
  },
  {
    dashboardKey: "innovation",
    description: "Demand audience-filtered aggregates",
    title: "Innovation",
  },
  {
    dashboardKey: "review",
    description: "Review decision aggregates",
    title: "Review",
  },
  {
    dashboardKey: "department",
    description: "Department-scoped demand aggregates",
    title: "Department",
  },
  {
    dashboardKey: "risk",
    description: "Reported interaction aggregates",
    title: "Risk",
  },
  {
    dashboardKey: "runtime",
    description: "Notification queue aggregates",
    title: "Runtime",
  },
  {
    dashboardKey: "integration",
    description: "Assistant request aggregates",
    title: "Integration",
  },
];

export default function AnalyticsDashboardPage() {
  return (
    <div className="space-y-6">
      <section aria-labelledby="analytics-heading" className="space-y-3">
        <Text type="secondary">Phase 6 / Fixed analytics</Text>
        <Title id="analytics-heading" level={1} className="!mb-0">
          Analytics dashboards
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          Numbers are rebuildable from retained raw events. Dashboard output is
          permission-filtered and never exposes individual access lists.
        </Paragraph>
      </section>
      <Alert
        showIcon
        type="info"
        title="Read-only aggregate boundary"
        description="Each metric declares its source events, formula, time range, permission, audience rule, and recomputation method."
      />
      <section
        aria-label="Fixed analytics dashboards"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {fixedAnalyticsDashboards.map((dashboard) => (
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
