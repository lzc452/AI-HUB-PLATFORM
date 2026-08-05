import { Layout, Spin } from "antd";
import { Suspense } from "react";
import { Outlet } from "react-router-dom";

import { Header } from "./Header";

const { Content } = Layout;

export function AppShell() {
  return (
    <Layout className="min-h-screen bg-[#f5f5f5] text-[#1f1f1f]">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <Header />
      <Content
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        tabIndex={-1}
      >
        <Suspense fallback={<Spin aria-label="页面加载中" />}>
          <Outlet />
        </Suspense>
      </Content>
    </Layout>
  );
}
