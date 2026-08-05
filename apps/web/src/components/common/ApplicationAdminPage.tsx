import { Alert, Typography } from "antd";
import { NavLink, useParams } from "react-router-dom";

const { Paragraph, Text, Title } = Typography;

export function ApplicationNavigation() {
  const { applicationId = "app-001" } = useParams();
  const items = [
    { label: "Application details", path: `/applications/${applicationId}` },
    { label: "Versions", path: `/applications/${applicationId}/versions` },
    { label: "Review", path: `/applications/${applicationId}/review` },
    { label: "Delivery", path: `/applications/${applicationId}/delivery` },
  ] as const;

  return (
    <nav aria-label="Application administration">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {items.map((item) => (
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

export interface ApplicationAdminPageProps {
  children: React.ReactNode;
  description: string;
  title: string;
}

export function ApplicationAdminPage({
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
        description="数据已通过内部 API 接入；当前界面不提供写操作。"
        showIcon
        title="Read-only preview"
        type="info"
      />
      {children}
    </div>
  );
}
