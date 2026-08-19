import {
  AppstoreAddOutlined,
  AppstoreOutlined,
  BellOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Menu } from "antd";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import { readLastViewedApplicationId } from "../../modules/application/last-viewed";
import { useAuth } from "../../modules/auth/useAuth";
import {
  canAccess,
  ROUTE_ACCESS,
  type PermissionRequirement,
} from "../../modules/auth/roles";
import { ROUTES } from "../../router/routes";

interface SidebarMenuItem {
  icon: React.ReactNode;
  key: string;
  label: string;
  path?: string | undefined;
  requiredPermissions?: PermissionRequirement;
}

/** 侧边栏主导航：路由和菜单共用权限配置。 */
export function Navigation() {
  const { actor, isLoading } = useAuth();
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
        requiredPermissions: ROUTE_ACCESS.marketplace,
      },
      {
        icon: <ExperimentOutlined aria-hidden="true" />,
        key: "innovation",
        label: "创新广场",
        path: ROUTES.innovation,
        requiredPermissions: ROUTE_ACCESS.innovation,
      },
      {
        icon: <AppstoreAddOutlined aria-hidden="true" />,
        key: "applications",
        label: "应用管理",
        path: ROUTES.applications,
        requiredPermissions: ROUTE_ACCESS.applications,
      },
      // {
      //   icon: <CheckCircleOutlined aria-hidden="true" />,
      //   key: "review",
      //   label: "审核工作台",
      //   path: reviewPath,
      //   requiredPermissions: ROUTE_ACCESS.applicationReview,
      // },
      {
        icon: <DashboardOutlined aria-hidden="true" />,
        key: "analytics",
        label: "数据看板",
        path: ROUTES.analytics,
        requiredPermissions: ROUTE_ACCESS.analytics,
      },
      {
        icon: <TeamOutlined aria-hidden="true" />,
        key: "organization",
        label: "组织管理",
        path: ROUTES.organization,
        requiredPermissions: ROUTE_ACCESS.organization,
      },
      {
        icon: <SafetyCertificateOutlined aria-hidden="true" />,
        key: "security",
        label: "系统安全",
        path: ROUTES.security,
        requiredPermissions: ROUTE_ACCESS.security,
      },
      // {
      //   icon: <RobotOutlined aria-hidden="true" />,
      //   key: "assistant",
      //   label: "AI 助手",
      //   path: ROUTES.assistant,
      //   requiredPermissions: ROUTE_ACCESS.assistant,
      // },
      {
        icon: <BellOutlined aria-hidden="true" />,
        key: "notifications",
        label: "站内通知",
        path: ROUTES.notifications,
        requiredPermissions: ROUTE_ACCESS.notifications,
      },
    ];
    if (isLoading || !actor) {
      return [];
    }
    return items.filter((item) => canAccess(actor, item.requiredPermissions));
  }, [actor, isLoading, reviewPath]);

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
