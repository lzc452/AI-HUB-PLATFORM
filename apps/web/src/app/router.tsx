import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { HealthSnapshot } from "@ai-hub/contracts";
import { Alert, Descriptions, Layout, Tag, Typography } from "antd";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useParams,
} from "react-router-dom";
import { useMemo } from "react";

const { Content, Header } = Layout;
const { Paragraph, Text, Title } = Typography;

const shellHealthSnapshot: HealthSnapshot = {
  status: "degraded",
  checks: {
    前端壳体: "up",
    业务数据接入: "down",
    流程动作接入: "down",
  },
  timestamp: "2026-07-31T00:00:00.000Z",
};

const navigationItems = [
  {
    description: "静态状态页",
    icon: <AppstoreOutlined aria-hidden="true" />,
    path: "/marketplace",
    title: "应用市场",
  },
  {
    description: "静态状态页",
    icon: <ExperimentOutlined aria-hidden="true" />,
    path: "/innovation",
    title: "创新广场",
  },
] as const;

const navigationItemsWithAdmin = [
  ...navigationItems,
  {
    description: "static administration",
    icon: <DeploymentUnitOutlined aria-hidden="true" />,
    path: "/applications",
    title: "Applications",
  },
  {
    description: "admin placeholder",
    icon: <DeploymentUnitOutlined aria-hidden="true" />,
    path: "/organization",
    title: "Organization",
  },
  {
    description: "security placeholder",
    icon: <SafetyCertificateOutlined aria-hidden="true" />,
    path: "/security",
    title: "Security",
  },
] as const;

type FeatureStatusPageProps = {
  description: string;
  details: readonly string[];
  healthSnapshot: HealthSnapshot;
  statusLabel: string;
  title: string;
};

function formatSnapshotTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(timestamp));
}

function getCheckTag(status: "up" | "down") {
  return status === "up" ? (
    <Tag color="success" icon={<CheckCircleOutlined aria-hidden="true" />}>
      已就绪
    </Tag>
  ) : (
    <Tag color="default" icon={<ClockCircleOutlined aria-hidden="true" />}>
      待接入
    </Tag>
  );
}

function FeatureStatusPage({
  description,
  details,
  healthSnapshot,
  statusLabel,
  title,
}: FeatureStatusPageProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <section aria-labelledby={`${title}-heading`} className="space-y-6">
        <div className="space-y-3">
          <Text type="secondary">{statusLabel}</Text>
          <Title id={`${title}-heading`} level={1} className="!mb-0">
            {title}
          </Title>
          <Paragraph className="!mb-0 max-w-3xl text-base">
            {description}
          </Paragraph>
        </div>
        <Alert
          className="max-w-3xl"
          description="当前界面只承载导航、布局、无障碍和设计系统基线，不包含业务写操作。"
          title="该阶段未接入真实业务能力"
          showIcon
          type="info"
        />
        <section aria-labelledby={`${title}-next-steps`} className="space-y-3">
          <Title id={`${title}-next-steps`} level={3} className="!mb-0">
            后续接入范围
          </Title>
          <ul className="m-0 space-y-3 pl-5">
            {details.map((detail) => (
              <li key={detail}>
                <Text>{detail}</Text>
              </li>
            ))}
          </ul>
        </section>
      </section>
      <aside aria-labelledby={`${title}-baseline`} className="space-y-4">
        <section className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Title id={`${title}-baseline`} level={4} className="!mb-0">
              基线状态
            </Title>
            <Tag
              color={healthSnapshot.status === "ok" ? "success" : "processing"}
            >
              {healthSnapshot.status === "ok" ? "整体就绪" : "局部建设中"}
            </Tag>
          </div>
          <Descriptions
            column={1}
            items={Object.entries(healthSnapshot.checks).map(
              ([label, status]) => ({
                key: label,
                label,
                children: getCheckTag(status),
              }),
            )}
            size="small"
          />
          <div className="mt-4 flex items-center gap-2 text-sm text-[#8c8c8c]">
            <SafetyCertificateOutlined aria-hidden="true" />
            <span>
              静态快照时间：{formatSnapshotTimestamp(healthSnapshot.timestamp)}
            </span>
          </div>
        </section>
        <section className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <Title level={4} className="!mb-3">
            当前壳体已覆盖
          </Title>
          <ul className="m-0 space-y-3 pl-5">
            <li className="flex items-start gap-2">
              <DeploymentUnitOutlined
                aria-hidden="true"
                className="mt-1 text-[#1677ff]"
              />
              <span>响应式布局与主导航骨架</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleOutlined
                aria-hidden="true"
                className="mt-1 text-[#1677ff]"
              />
              <span>跳到主要内容、键盘焦点与可见状态表达</span>
            </li>
            <li className="flex items-start gap-2">
              <ClockCircleOutlined
                aria-hidden="true"
                className="mt-1 text-[#1677ff]"
              />
              <span>Ant Design 主题令牌、中文字体与静态路由占位</span>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

const applicationNavigationItems = [
  { label: "Application details", path: "/applications/app-001" },
  { label: "Versions", path: "/applications/app-001/versions" },
  { label: "Review", path: "/applications/app-001/review" },
  { label: "Delivery", path: "/applications/app-001/delivery" },
] as const;

function ApplicationNavigation() {
  return (
    <nav aria-label="Application administration">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {applicationNavigationItems.map((item) => (
          <li key={item.path}>
            <NavLink
              className={({ isActive }) =>
                `inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-[#1677ff] bg-[#e6f4ff] text-[#0958d9]"
                    : "border-[#d9d9d9] bg-white text-[#1f1f1f] hover:border-[#91caff] hover:text-[#0958d9]"
                }`
              }
              to={item.path}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type ApplicationAdminPageProps = {
  children: React.ReactNode;
  description: string;
  title: string;
};

function ApplicationAdminPage({
  children,
  description,
  title,
}: ApplicationAdminPageProps) {
  return (
    <div className="space-y-6">
      <section aria-labelledby={`${title}-heading`} className="space-y-3">
        <Text type="secondary">Phase 3 / Application administration</Text>
        <Title id={`${title}-heading`} level={1} className="!mb-0">
          {title}
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          {description}
        </Paragraph>
      </section>
      <ApplicationNavigation />
      <Alert
        description="This is a static administration shell; no business writes are enabled."
        message="Read-only preview"
        showIcon
        type="info"
      />
      {children}
    </div>
  );
}

function ApplicationsPage() {
  return (
    <ApplicationAdminPage
      description="Review application records, immutable versions, review history, and delivery configuration from one administration surface."
      title="Applications"
    >
      <section
        aria-labelledby="application-directory-heading"
        className="space-y-4"
      >
        <Title id="application-directory-heading" level={2} className="!mb-0">
          Application directory
        </Title>
        <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Title level={3} className="!mb-0">
                Internal AI assistant
              </Title>
              <Text type="secondary">
                app-001 · owned by Platform Operations
              </Text>
            </div>
            <Tag color="blue">Published version 1.2.0</Tag>
          </div>
          <div className="mt-4">
            <Link to="/applications/app-001">Application details</Link>
          </div>
        </div>
        <div
          className="grid gap-4 md:grid-cols-2"
          aria-label="Directory states"
        >
          <div className="rounded-md border border-dashed border-[#d9d9d9] bg-white p-5">
            <Text strong>Empty</Text>
            <Paragraph className="!mb-0 mt-2">
              No additional applications are waiting for administration.
            </Paragraph>
          </div>
          <div className="rounded-md border border-dashed border-[#d9d9d9] bg-white p-5">
            <Text strong>Loading</Text>
            <Paragraph className="!mb-0 mt-2">
              Loading state is reserved for the future data connection.
            </Paragraph>
          </div>
        </div>
      </section>
    </ApplicationAdminPage>
  );
}

const applicationLifecycleStates = [
  { color: "default", label: "Draft" },
  { color: "processing", label: "In review" },
  { color: "success", label: "Approved" },
  { color: "blue", label: "Published" },
  { color: "error", label: "Rejected" },
  { color: "warning", label: "Withdrawn" },
  { color: "default", label: "Archived" },
] as const;

function ApplicationDetailsPage() {
  const { applicationId } = useParams();

  return (
    <ApplicationAdminPage
      description={`Static lifecycle overview for ${applicationId ?? "app-001"}.`}
      title="Application details"
    >
      <section aria-labelledby="lifecycle-heading" className="space-y-4">
        <Title id="lifecycle-heading" level={2} className="!mb-0">
          Lifecycle states
        </Title>
        <div
          className="flex flex-wrap gap-2"
          aria-label="Application lifecycle states"
        >
          {applicationLifecycleStates.map((state) => (
            <Tag color={state.color} key={state.label}>
              {state.label}
            </Tag>
          ))}
        </div>
        <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Text type="secondary">Current state</Text>
              <Title level={3} className="!mb-0 !mt-1">
                Published
              </Title>
            </div>
            <Tag color="blue">Published version</Tag>
          </div>
          <Paragraph className="!mb-0 !mt-4">
            The published version is displayed for review only. Rollback and
            other state changes are intentionally unavailable in this shell.
          </Paragraph>
        </div>
      </section>
    </ApplicationAdminPage>
  );
}

function ApplicationVersionsPage() {
  return (
    <ApplicationAdminPage
      description="Compare immutable application versions and their artifact metadata."
      title="Versions"
    >
      <section aria-labelledby="versions-heading" className="space-y-4">
        <Title id="versions-heading" level={2} className="!mb-0">
          Version history
        </Title>
        <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Title level={3} className="!mb-1">
                v1.2.0
              </Title>
              <Text type="secondary">
                Published version · artifact verified
              </Text>
            </div>
            <Tag color="blue">Published</Tag>
          </div>
          <Paragraph className="!mb-0 !mt-4">
            Version records are append-only; editing creates a new version.
          </Paragraph>
        </div>
      </section>
    </ApplicationAdminPage>
  );
}

function ApplicationReviewPage() {
  return (
    <ApplicationAdminPage
      description="Inspect review readiness and the audit-safe review history."
      title="Review"
    >
      <section aria-labelledby="review-heading" className="space-y-4">
        <Title id="review-heading" level={2} className="!mb-0">
          Review history
        </Title>
        <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <Tag color="success">Approved</Tag>
          <Paragraph className="!mb-0 !mt-3">
            Review actions are shown as read-only history until the review API
            is connected.
          </Paragraph>
        </div>
      </section>
    </ApplicationAdminPage>
  );
}

function ApplicationDeliveryPage() {
  const deliveryChannels = ["Web", "Desktop", "Mobile", "Mini-program"];

  return (
    <ApplicationAdminPage
      description="Inspect separate delivery configurations for each supported client channel."
      title="Delivery"
    >
      <section aria-labelledby="delivery-heading" className="space-y-4">
        <Title id="delivery-heading" level={2} className="!mb-0">
          Delivery channels
        </Title>
        <div className="grid gap-4 sm:grid-cols-2">
          {deliveryChannels.map((channel) => (
            <div
              className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
              key={channel}
            >
              <div className="flex items-center justify-between gap-3">
                <Title level={3} className="!mb-0">
                  {channel}
                </Title>
                <Tag color="default">Disabled</Tag>
              </div>
              <Text type="secondary">
                Configuration is read-only in this shell.
              </Text>
            </div>
          ))}
        </div>
      </section>
    </ApplicationAdminPage>
  );
}

function AppShell() {
  return (
    <Layout className="min-h-screen bg-[#f5f5f5] text-[#1f1f1f]">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <Header
        className="border-b border-solid border-[#d9d9d9]"
        style={{
          background: "#fff",
          height: "auto",
          lineHeight: "normal",
          padding: 0,
        }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-sm text-[#595959]">
                企业内部 AI 应用共享平台
              </p>
              <p className="m-0 text-lg font-semibold text-[#1f1f1f]">
                React 应用壳体基线
              </p>
            </div>
            <Tag color="blue">Phase 01 / Foundation</Tag>
          </div>
          <nav aria-label="主导航">
            <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
              {navigationItemsWithAdmin.map((item) => (
                <li key={item.path}>
                  <NavLink to={item.path}>
                    {({ isActive }) => (
                      <span
                        className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "border-[#1677ff] bg-[#e6f4ff] text-[#0958d9]"
                            : "border-[#d9d9d9] bg-white text-[#1f1f1f] hover:border-[#91caff] hover:text-[#0958d9]"
                        }`}
                      >
                        {item.icon}
                        <span>{item.title}</span>
                        <span className="text-xs text-[#595959]">
                          {isActive ? "当前" : item.description}
                        </span>
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Header>
      <Content
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        tabIndex={-1}
      >
        <Outlet />
      </Content>
    </Layout>
  );
}

function createAppRouter() {
  return createBrowserRouter([
    {
      element: <AppShell />,
      children: [
        {
          element: <Navigate replace to="/marketplace" />,
          path: "/",
        },
        {
          element: (
            <FeatureStatusPage
              description="该模块正在建设中，当前仅提供应用壳体与静态状态页。"
              details={[
                "目录列表、分类筛选与详情页骨架将在后续任务中接入。",
                "交付入口、权限过滤和运营排序保持关闭状态。",
                "加载态、空态和错误态将在真实数据接入时完善。",
              ]}
              healthSnapshot={shellHealthSnapshot}
              statusLabel="基础模块 / 静态页面"
              title="应用市场"
            />
          ),
          path: "/marketplace",
        },
        {
          element: <ApplicationsPage />,
          path: "/applications",
        },
        {
          element: <ApplicationDetailsPage />,
          path: "/applications/:applicationId",
        },
        {
          element: <ApplicationVersionsPage />,
          path: "/applications/:applicationId/versions",
        },
        {
          element: <ApplicationReviewPage />,
          path: "/applications/:applicationId/review",
        },
        {
          element: <ApplicationDeliveryPage />,
          path: "/applications/:applicationId/delivery",
        },
        {
          element: (
            <FeatureStatusPage
              description="需求提交、认领与试点流程将在后续任务中逐步接入。"
              details={[
                "创新需求表单、轻量审核与认领方案暂未开放。",
                "状态推进、试点记录和需求关联将在后续任务中接入。",
                "当前页面仅用于验证导航、布局和设计系统基线。",
              ]}
              healthSnapshot={shellHealthSnapshot}
              statusLabel="基础模块 / 静态页面"
              title="创新广场"
            />
          ),
          path: "/innovation",
        },
        {
          element: (
            <FeatureStatusPage
              description="Identity and organization administration is connected to the Phase 2 API baseline."
              details={[
                "Employee and department records are available through the protected internal API.",
                "DingTalk directory synchronization remains an operator-triggered integration.",
                "Role assignment and organization workflows will be expanded with the next administration slice.",
              ]}
              healthSnapshot={shellHealthSnapshot}
              statusLabel="Phase 2 / Identity and organization"
              title="Organization"
            />
          ),
          path: "/organization",
        },
        {
          element: (
            <FeatureStatusPage
              description="Local password login, sessions, password reset challenges, and authorization are available through the Phase 2 API baseline."
              details={[
                "Sessions are checked for employee ownership, expiry, and revocation before actor context creation.",
                "Password reset completion revokes the employee sessions and records an audit event.",
                "DingTalk OAuth credentials and production security policy remain external deployment inputs.",
              ]}
              healthSnapshot={shellHealthSnapshot}
              statusLabel="Phase 2 / Security"
              title="Security"
            />
          ),
          path: "/security",
        },
      ],
    },
  ]);
}

export function AppRouter() {
  const router = useMemo(() => createAppRouter(), []);

  return <RouterProvider router={router} />;
}
