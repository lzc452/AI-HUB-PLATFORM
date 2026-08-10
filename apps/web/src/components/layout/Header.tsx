import {
  BellOutlined,
  DownOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Dropdown,
  Input,
  Layout,
  Modal,
  Popover,
} from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { readLastViewedApplicationId } from "../../modules/application/last-viewed";
import { useAuth } from "../../modules/auth/useAuth";
import { ROUTE_ACCESS } from "../../modules/auth/roles";
import {
  readSearchQuery,
  searchPath,
} from "../../modules/marketplace/search.store";
import { useNotifications } from "../../modules/notification/useNotification";
import { ROUTES } from "../../router/routes";
import logoUrl from "../../../assets/logo.png";

const { Header: LayoutHeader } = Layout;

export interface HeaderProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

export function Header({ onMenuClick, showMenuButton }: HeaderProps) {
  const { actor, canAccess, logout } = useAuth();
  const notifications = useNotifications({ enabled: actor !== null });
  const navigate = useNavigate();
  const location = useLocation();

  const unread = (notifications.data ?? []).filter(
    (item) => item.readAt === null,
  );
  const unreadCount = unread.length;
  const recentUnread = unread.slice(0, 5);
  const lastApplicationId = readLastViewedApplicationId();
  const creatorPath =
    canAccess(ROUTE_ACCESS.creator) && lastApplicationId
      ? `/creator/${lastApplicationId}`
      : undefined;

  const handleLogout = () => {
    Modal.confirm({
      cancelText: "取消",
      content: "退出后需要重新登录才能继续使用。",
      okText: "退出登录",
      okType: "danger",
      onOk: async () => {
        await logout();
        navigate(ROUTES.login, { replace: true });
      },
      title: "确认退出登录？",
    });
  };

  return (
    <LayoutHeader
      className="border-b border-solid border-[#d9d9d9]"
      style={{
        background: "#fff",
        height: 56,
        lineHeight: "56px",
        padding: "0 16px",
      }}
    >
      <div className="flex h-full w-full items-center gap-4">
        {showMenuButton ? (
          <Button
            aria-label="打开菜单"
            icon={<MenuUnfoldOutlined aria-hidden="true" />}
            onClick={onMenuClick}
            type="text"
          />
        ) : null}
        <Link
          aria-label="返回应用市场"
          className="flex shrink-0 items-center gap-2 text-[#1f1f1f]"
          to={ROUTES.marketplace}
        >
          <img alt="AI应用共享平台" className="h-8 w-auto" src={logoUrl} />
        </Link>

        <div className="flex flex-1 justify-center">
          {location.pathname === ROUTES.marketplace ? (
            <Input.Search
              allowClear
              aria-label="搜索应用"
              defaultValue={readSearchQuery()}
              onSearch={(value) => navigate(searchPath(value))}
              placeholder="搜索应用名称、标签、场景…"
              style={{ maxWidth: 400 }}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Popover
            content={
              <div className="w-72">
                {recentUnread.length === 0 ? (
                  <p className="m-0 py-4 text-center text-sm text-[#595959]">
                    暂无新通知
                  </p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {recentUnread.map((item) => (
                      <li
                        className="border-b border-[#f0f0f0] py-2 text-sm text-[#1f1f1f]"
                        key={item.notificationId}
                      >
                        <span className="line-clamp-1">{item.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pt-2 text-right">
                  <Link to={ROUTES.notifications}>查看全部通知</Link>
                </div>
              </div>
            }
            placement="bottomRight"
            trigger="click"
          >
            <Badge count={unreadCount} size="small">
              <Button
                aria-label="消息通知"
                icon={<BellOutlined aria-hidden="true" />}
                type="text"
              />
            </Badge>
          </Popover>

          <Dropdown
            menu={{
              items: [
                ...(canAccess(ROUTE_ACCESS.applications)
                  ? [
                      {
                        key: "my-apps",
                        label: <Link to={ROUTES.applications}>我的应用</Link>,
                      },
                    ]
                  : []),
                ...(creatorPath
                  ? [
                      {
                        key: "creator",
                        label: "创作者中心",
                        onClick: () => navigate(creatorPath),
                      },
                    ]
                  : [{ disabled: true, key: "creator", label: "创作者中心" }]),
                {
                  disabled: true,
                  key: "account",
                  label: "账号安全（后续版本）",
                },
                { type: "divider" },
                {
                  danger: true,
                  key: "logout",
                  label: "退出登录",
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <Button
              className="flex items-center gap-1"
              icon={<UserOutlined aria-hidden="true" />}
              type="text"
            >
              <span className="hidden sm:inline">{actor?.employeeId ?? "未登录"}</span>
              <DownOutlined aria-hidden="true" />
            </Button>
          </Dropdown>
        </div>
      </div>
    </LayoutHeader>
  );
}
