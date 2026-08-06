import {
  AppstoreAddOutlined,
  AppstoreOutlined,
  BellOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Menu } from "antd";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import { readLastViewedApplicationId } from "../../modules/application/last-viewed";
import { useAuth } from "../../modules/auth/useAuth";
import {
  canSeeMenu,
  ROLE_APP_ADMIN,
  ROLE_INNOVATION_ADMIN,
  ROLE_ORG_ADMIN,
  ROLE_SUPER_ADMIN,
} from "../../modules/auth/roles";
import { ROUTES } from "../../router/routes";

interface SidebarMenuItem {
  allowedRoles?: readonly string[];
  icon: React.ReactNode;
  key: string;
  label: string;
  path?: string | undefined;
}

/** 侧边栏主导航：按角色过滤、按当前路径高亮。 */
export function Navigation() {
  const { actor } = useAuth();
  const location = useLocation();
  const lastApplicationId = readLastViewedApplicationId();
  const reviewPath = lastApplicationId
    ? `/applications/${lastApplicationId}/review`
    : undefined;

  const menuItems: readonly SidebarMenuItem[] = useMemo(() => {
    const items: SidebarMenuItem[] = [
      {
        icon: <AppstoreOutlined aria-hidden="true" />,
        key: "marketplace",
        label: "应用市场",
        path: ROUTES.marketplace,
      },
      {
        icon: <ExperimentOutlined aria-hidden="true" />,
        key: "innovation",
        label: "创新广场",
        path: ROUTES.innovation,
      },
      {
        allowedRoles: [ROLE_APP_ADMIN, ROLE_SUPER_ADMIN],
        icon: <AppstoreAddOutlined aria-hidden="true" />,
        key: "applications",
        label: "Applications",
        path: ROUTES.applications,
      },
      {
        allowedRoles: [ROLE_APP_ADMIN, ROLE_SUPER_ADMIN],
        icon: <CheckCircleOutlined aria-hidden="true" />,
        key: "review",
        label: "审核工作台",
        path: reviewPath,
      },
      {
        allowedRoles: [
          ROLE_APP_ADMIN,
          ROLE_ORG_ADMIN,
          ROLE_SUPER_ADMIN,
          ROLE_INNOVATION_ADMIN,
        ],
        icon: <DashboardOutlined aria-hidden="true" />,
        key: "analytics",
        label: "Analytics",
        path: ROUTES.analytics,
      },
      {
        allowedRoles: [ROLE_ORG_ADMIN, ROLE_SUPER_ADMIN],
        icon: <TeamOutlined aria-hidden="true" />,
        key: "organization",
        label: "Organization",
        path: ROUTES.organization,
      },
      {
        allowedRoles: [ROLE_SUPER_ADMIN],
        icon: <SafetyCertificateOutlined aria-hidden="true" />,
        key: "security",
        label: "Security",
        path: ROUTES.security,
      },
      {
        icon: <RobotOutlined aria-hidden="true" />,
        key: "assistant",
        label: "AI 助手",
        path: ROUTES.assistant,
      },
      {
        icon: <BellOutlined aria-hidden="true" />,
        key: "notifications",
        label: "站内通知",
        path: ROUTES.notifications,
      },
    ];
    return items.filter((item) =>
      canSeeMenu(actor, item.allowedRoles ?? []),
    );
  }, [actor, reviewPath]);

  const selectedKey = useMemo(() => {
    const { pathname } = location;
    const exact = menuItems.find((item) => item.path === pathname);
    if (exact) {
      return exact.key;
    }
    return menuItems.find((item) =>
      item.path ? pathname.startsWith(`${item.path}/`) : false,
    )?.key;
  }, [location.pathname, menuItems]);

  return (
    <nav aria-label="主导航">
      <Menu
        items={menuItems.map((item) => ({
          disabled: item.key === "review" && !item.path,
          icon: item.icon,
          key: item.key,
          label:
            item.path && item.key !== "review" ? (
              <Link to={item.path}>{item.label}</Link>
            ) : (
              item.label
            ),
        }))}
        mode="inline"
        selectedKeys={selectedKey ? [selectedKey] : []}
        style={{ borderInlineEnd: "none" }}
      />
    </nav>
  );
}
