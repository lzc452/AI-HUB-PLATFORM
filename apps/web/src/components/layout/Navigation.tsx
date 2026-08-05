import {
  AppstoreOutlined,
  CheckCircleOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { NavLink } from "react-router-dom";

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
    description: "Phase 6 dashboards",
    icon: <DeploymentUnitOutlined aria-hidden="true" />,
    path: "/analytics",
    title: "Analytics",
  },
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
  {
    description: "通知中心",
    icon: <CheckCircleOutlined aria-hidden="true" />,
    path: "/notifications",
    title: "站内通知",
  },
] as const;

export function Navigation() {
  return (
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
  );
}
