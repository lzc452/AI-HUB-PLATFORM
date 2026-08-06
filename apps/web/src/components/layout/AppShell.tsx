import { Layout, Spin } from "antd";
import { Suspense } from "react";
import { Outlet } from "react-router-dom";

import { Breadcrumbs } from "./Breadcrumbs";
import { Header } from "./Header";
import { Navigation } from "./Navigation";

const { Content, Sider } = Layout;

export function AppShell() {
  return (
    <Layout
      className="bg-[#f5f5f5] text-[#1f1f1f]"
      style={{ height: "100vh" }}
    >
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <Header />
      <Layout style={{ overflow: "hidden" }}>
        <Sider
          collapsedWidth={64}
          style={{
            background: "#fff",
            borderRight: "1px solid #d9d9d9",
          }}
          theme="light"
          trigger={null}
          width={220}
        >
          <Navigation />
        </Sider>
        <Content
          id="main-content"
          className="min-h-0 p-6"
          style={{ background: "#f5f5f5", overflowY: "auto" }}
          tabIndex={-1}
        >
          <Breadcrumbs />
          <Suspense fallback={<Spin aria-label="页面加载中" />}>
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
