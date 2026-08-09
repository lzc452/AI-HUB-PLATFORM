import { Alert, Typography } from "antd";
import { NavLink, useParams } from "react-router-dom";

const { Text, Title } = Typography;

export function ApplicationNavigation() {
  const { applicationId = "app-001" } = useParams();
  const items = [
    { label: "应用详情", path: `/applications/${applicationId}` },
    { label: "版本管理", path: `/applications/${applicationId}/versions` },
    { label: "审核工作台", path: `/applications/${applicationId}/review` },
    { label: "交付配置", path: `/applications/${applicationId}/delivery` },
  ] as const;

  return (
    <nav aria-label="应用管理导航">
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
    <div className="space-y-4">
      <Title className="!mb-0" level={1}>
        {title}
      </Title>
      <Text type="secondary">{description}</Text>
      <ApplicationNavigation />
      <Alert
        description="数据已通过内部 API 接入；当前界面不提供写操作。"
        showIcon
        title="只读预览"
        type="info"
      />
      {children}
    </div>
  );
}
