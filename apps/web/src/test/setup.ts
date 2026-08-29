import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { setSession } from "../modules/auth/session.store";
import { queryClient } from "../query-client";

configure({ asyncUtilTimeout: 5000 });

// jsdom 未实现 getComputedStyle 的伪元素参数（antd rc-table 测量滚动条时调用），
// 忽略伪元素参数以保持 antd 组件在 jsdom 下可挂载。
const originalGetComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis.window, "getComputedStyle", {
  configurable: true,
  value: (elt: Element) => originalGetComputedStyle(elt),
});

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(globalThis.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

beforeEach(() => {
  setSession({ employeeId: "E0001" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/internal/identity/actor")) {
        return Response.json({
          employeeId: "E0001",
          roleCodes: ["employee", "super_admin"],
          permissions: ["*"],
          departmentIds: ["dept-1"],
          primaryDepartmentId: "dept-1",
        });
      }
      if (path.includes("/internal/notifications/summary")) {
        return Response.json({ unreadCount: 0 });
      }
      if (path.includes("/internal/notifications/read-all")) {
        return Response.json({ updated: 0 });
      }
      if (path.includes("/internal/notifications")) {
        return Response.json([]);
      }
      if (path.includes("/internal/catalog?")) {
        return Response.json({
          items: [
            {
              applicationId: "app-dataviz",
              name: "数据可视化平台",
              summary: "拖拽式仪表盘搭建，支持多数据源接入与实时大屏展示。",
              departmentId: "dept-1",
              categoryId: "cat-data",
              tagIds: ["数据分析", "可视化", "仪表盘", "BI"],
              trustLabels: ["recommended"],
              currentVersionId: "version-dataviz",
              publishedAt: new Date().toISOString(),
              deliveryChannels: ["web"],
              likeCount: 125,
              ratingAverage: 4.8,
              ratingCount: 236,
              healthStatus: "healthy",
              deprecatedReason: null,
              replacementApplicationId: null,
            },
            {
              applicationId: "app-reportgen",
              name: "报表自动生成",
              summary: "按模板定时生成业务报表，支持 Excel 导出与邮件送达。",
              departmentId: "dept-1",
              categoryId: "cat-report",
              tagIds: ["报表", "自动化", "定时调度", "Excel导出"],
              trustLabels: [],
              currentVersionId: "version-reportgen",
              publishedAt: new Date().toISOString(),
              deliveryChannels: ["web"],
              likeCount: 98,
              ratingAverage: 4.7,
              ratingCount: 189,
              healthStatus: "healthy",
              deprecatedReason: null,
              replacementApplicationId: null,
            },
          ],
          page: 1,
          pageSize: 2,
          total: 2,
        });
      }
      if (path.includes("/internal/applications/admin-list")) {
        return Response.json({
          items: [
            {
              applicationId: "app-rd-perf-001",
              name: "缁熶竴鐮斿彂鏁堣兘鏁版嵁鐪嬫澘",
              summary: "",
              categoryId: "cat-rd",
              status: "published",
              currentVersion: "v1.0.0",
              currentVersionId: "version-rd-perf-001",
              ownerName: "E0001",
              departmentName: "研发部",
              deliveryChannels: ["web"],
              updatedAt: new Date().toISOString(),
              isMine: true,
              needsMyReview: false,
            },
          ],
          page: 1,
          pageSize: 10,
          total: 1,
        });
      }
      if (path.includes("/internal/identity/employees")) {
        return Response.json([
          {
            employeeId: "E0001",
            displayName: "张三",
            status: "active",
            primaryDepartmentId: "dept-1",
            roleNames: ["普通员工", "超级管理员"],
          },
        ]);
      }
      if (path.includes("/internal/identity/departments")) {
        return Response.json([
          {
            departmentId: "dept-1",
            name: "研发部",
            parentDepartmentId: null,
            source: "local",
          },
        ]);
      }
      if (path.includes("/internal/identity/roles")) {
        return Response.json([
          {
            roleId: "role-employee",
            roleName: "普通员工",
            roleType: "system",
            scope: "platform",
            memberCount: 1,
            creator: null,
            status: "active",
            updatedAt: new Date().toISOString(),
          },
          {
            roleId: "role-super-admin",
            roleName: "超级管理员",
            roleType: "system",
            scope: "platform",
            memberCount: 1,
            creator: null,
            status: "active",
            updatedAt: new Date().toISOString(),
          },
        ]);
      }
      if (path.includes("/internal/identity/sync-runs")) {
        return Response.json([]);
      }
      if (path.includes("/internal/identity/sync/config")) {
        return Response.json(null);
      }
      if (path.includes("/internal/security/audit-logs")) {
        return Response.json({ items: [], total: 0 });
      }
      return Response.json({}, { status: 404 });
    }),
  );
});

afterEach(async () => {
  // 先取消共享 QueryClient 的异步更新，避免 jsdom 销毁后 React scheduler 仍访问 window。
  await queryClient.cancelQueries();
  queryClient.clear();
  cleanup();
  setSession(null);
  vi.unstubAllGlobals();
  if (vi.isFakeTimers()) {
    vi.useRealTimers();
  }
});
