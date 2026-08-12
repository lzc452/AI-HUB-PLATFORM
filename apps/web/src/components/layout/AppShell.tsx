import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Drawer, Layout, Spin } from "antd";
import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Breadcrumbs } from "./Breadcrumbs";
import { Header } from "./Header";
import { Navigation } from "./Navigation";

const { Content, Sider } = Layout;

const SIDEBAR_COLLAPSED_KEY = "ai-hub.sidebar.collapsed";
const MOBILE_QUERY = "(max-width: 1199px)";

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => globalThis.window.matchMedia?.(MOBILE_QUERY).matches ?? false,
  );

  useEffect(() => {
    const mql = globalThis.window.matchMedia?.(MOBILE_QUERY);
    if (!mql) {
      return;
    }
    const handleChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

export function AppShell() {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (globalThis.window.matchMedia?.(MOBILE_QUERY).matches) {
      return true;
    }
    try {
      return globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleCollapse = (next: boolean) => {
    setCollapsed(next);
    try {
      globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // localStorage 不可用时仅保持内存状态
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Navigation />
      </div>
      {/* <Announcement /> */}
    </div>
  );

  return (
    <Layout className="bg-[#f5f5f5] text-[#1f1f1f]" style={{ height: "100vh" }}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <Header
        onMenuClick={() => setDrawerOpen(true)}
        showMenuButton={isMobile}
      />
      <Layout style={{ overflow: "hidden" }}>
        {isMobile ? null : (
          <div className="relative h-full">
            <Sider
              collapsed={collapsed}
              collapsedWidth={72}
              style={{
                background: "#fff",
                borderRight: "1px solid #d9d9d9",
                height: "100%",
              }}
              theme="light"
              trigger={null}
              width={228}
            >
              {sidebarContent}
            </Sider>
            <button
              aria-label={collapsed ? "展开菜单" : "收起菜单"}
              className="absolute top-1/2 z-10 -translate-y-1/2 right-[-14px] flex h-8 w-8 items-center justify-center rounded-full border border-[#d9d9d9] bg-white text-[#595959] shadow-sm transition-all duration-200 ease-out hover:border-[#1677ff] hover:text-[#1677ff] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]"
              onClick={() => handleCollapse(!collapsed)}
              type="button"
            >
              {collapsed ? (
                <RightOutlined aria-hidden="true" />
              ) : (
                <LeftOutlined aria-hidden="true" />
              )}
            </button>
          </div>
        )}
        <Content
          id="main-content"
          className="min-h-0 px-5 pb-5 pt-3"
          style={{ background: "#f5f5f5", overflowY: "auto" }}
          tabIndex={-1}
        >
          <Breadcrumbs />
          <Suspense fallback={<Spin aria-label="页面加载中" />}>
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
      <Drawer
        closable={false}
        onClose={() => setDrawerOpen(false)}
        open={isMobile ? drawerOpen : false}
        placement="left"
        styles={{ body: { padding: 0 } }}
        width={180}
      >
        {sidebarContent}
      </Drawer>
    </Layout>
  );
}
