# Kimi K3 — AI Hub 平台前端构建提示词

**日期：** 2026-08-05
**背景：** 后端阶段 1–7 已完成。前端目前是临时性的扁平 SPA（两个文件：`App.tsx` + `router.tsx`）。本提示词要求你将其重建为完整的前端工程项目。

---


## 任务

将 `apps/web/src/` 从扁平的两文件 SPA 重建为分层前端项目，实现正确的关注点分离：pages、components、modules、router 与 shared 基础设施。当前静态外壳组件应拆分到目标结构中，保留所有现有行为与测试，然后在之上构建新的真实数据页面。

## 当前状态（现有内容）

```
apps/web/src/
├── main.tsx            # entry point — creates root, renders <App />
├── styles.css          # global styles with Tailwind layers, skip-link, reduced-motion
├── app/
│   ├── App.tsx         # 10 lines: <AppProviders><AppRouter /></AppProviders>
│   ├── App.test.tsx    # 13 tests covering nav, routes, accessibility
│   ├── providers.tsx   # Ant Design ConfigProvider + TanStack QueryClientProvider
│   ├── router.tsx      # 957 lines — ALL components AND ALL routes in ONE FILE
│   ├── phase4.test.tsx
│   ├── phase6.test.tsx
│   └── identity-admin.test.tsx
└── test/
    ├── setup.ts
    ├── environment.ts
    └── icons.tsx
```

`router.tsx` 包含这些与路由配置混在一起的内部组件：
- `AppShell`, `MarketplacePage`, `MarketplaceDetailPage`, `InnovationSquarePage`, `InnovationDemandDetailPage`, `NotificationsPage`, `CreatorCenterPage`, `ApplicationsPage`, `ApplicationDetailsPage`, `ApplicationVersionsPage`, `ApplicationReviewPage`, `ApplicationDeliveryPage`, `AnalyticsDashboardPage`, `OrganizationPage`, `SecurityPage`, `FeatureStatusPage`, `ApplicationAdminPage`
- 全部渲染静态占位内容。前端任何位置都没有 API 调用。

## 目标架构

```
apps/web/src/
├── main.tsx
├── App.tsx
├── styles.css
│
├── pages/                    ← one component per route, default-exported
│   ├── marketplace/
│   │   ├── MarketplacePage.tsx
│   │   └── MarketplaceDetailPage.tsx
│   ├── innovation/
│   │   ├── InnovationSquarePage.tsx
│   │   └── InnovationDemandDetailPage.tsx
│   ├── applications/
│   │   ├── ApplicationsPage.tsx
│   │   ├── ApplicationDetailsPage.tsx
│   │   ├── ApplicationVersionsPage.tsx
│   │   ├── ApplicationReviewPage.tsx
│   │   └── ApplicationDeliveryPage.tsx
│   ├── analytics/
│   │   └── AnalyticsDashboardPage.tsx
│   ├── organization/
│   │   └── OrganizationPage.tsx
│   ├── security/
│   │   └── SecurityPage.tsx
│   ├── notifications/
│   │   └── NotificationsPage.tsx
│   └── creator/
│       └── CreatorCenterPage.tsx
│
├── components/               ← shared UI, no API calls, no business logic
│   ├── layout/
│   │   ├── AppShell.tsx      ← skip-link, header, nav, <Outlet />
│   │   ├── Header.tsx
│   │   └── Navigation.tsx
│   └── common/
│       ├── FeatureStatusPage.tsx
│       └── HealthSnapshotCard.tsx
│
├── modules/                  ← domain logic, data fetching, state
│   ├── auth/
│   │   ├── auth.context.tsx
│   │   ├── useAuth.ts
│   │   └── auth.client.ts
│   ├── marketplace/
│   │   ├── marketplace.client.ts
│   │   └── useCatalog.ts
│   ├── application/
│   │   ├── application.client.ts
│   │   └── useApplication.ts
│   ├── interaction/
│   │   ├── interaction.client.ts
│   │   └── useInteraction.ts
│   ├── notification/
│   │   ├── notification.client.ts
│   │   └── useNotification.ts
│   ├── innovation/
│   │   ├── demand.client.ts
│   │   └── useDemand.ts
│   └── analytics/
│       ├── analytics.client.ts
│       └── useAnalytics.ts
│
├── router/
│   ├── index.ts              ← createBrowserRouter with lazy() routes
│   ├── routes.ts             ← ROUTES constant object
│   └── guards.ts             ← auth guards
│
├── shared/
│   ├── api/
│   │   └── client.ts         ← fetch wrapper with auth headers
│   └── types.ts
│
└── test/
    ├── setup.ts
    ├── environment.ts
    └── icons.tsx
```

## 分层规则

```
pages ──► components ──► shared
  │           │
  └───────────┼──────► modules ──► shared

pages 可导入：components/、modules/、router/routes、shared/
pages 不可：导入其他页面、直接包含 fetch 调用

components 可导入：shared/、其他组件
components 不可：调用 API、从 modules/ 导入（仅类型导入除外）

modules 可导入：shared/、TanStack Query
modules 不可：导入 React 组件（上下文提供者除外）

router 可导入：pages/（懒加载）、modules/auth（守卫）
router 不可：包含 UI 或业务逻辑
```


## 阶段 1：拆分（不新增功能，保留所有测试）

### 步骤 1.1：创建目录脚手架

在 `pages/`、`components/`、`modules/`、`router/`、`shared/` 下创建所有空目录。

### 步骤 1.2：抽取 `router/routes.ts`

```ts
// router/routes.ts
export const ROUTES = {
  home: "/",
  marketplace: "/marketplace",
  marketplaceDetail: "/marketplace/:applicationId",
  innovation: "/innovation",
  innovationDetail: "/innovation/:demandId",
  applications: "/applications",
  applicationDetail: "/applications/:applicationId",
  applicationVersions: "/applications/:applicationId/versions",
  applicationReview: "/applications/:applicationId/review",
  applicationDelivery: "/applications/:applicationId/delivery",
  analytics: "/analytics",
  organization: "/organization",
  security: "/security",
  notifications: "/notifications",
  creator: "/creator/:applicationId",
} as const;
```

### 步骤 1.3：抽取共享组件

将 `AppShell`、`Header`、`Navigation`、`FeatureStatusPage`、`HealthSnapshotCard` 与 `ApplicationAdminPage` 从 `router.tsx` 抽取到 `components/`。每个组件一个文件，并导出 props 接口。

### 步骤 1.4：抽取页面

将每个页面组件（MarketplacePage、InnovationSquarePage 等）移动到 `pages/` 下的独立文件。每个文件默认导出页面组件。

### 步骤 1.5：重写 `router/index.ts`

对每个路由使用 `lazy()` 以启用代码分割：

```ts
// router/index.ts
import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import { ROUTES } from "./routes";
import { AppShell } from "../components/layout/AppShell";

const MarketplacePage = lazy(() => import("../pages/marketplace/MarketplacePage"));
// ...etc

export function createRouter() {
  return createBrowserRouter([
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate replace to={ROUTES.marketplace} /> },
        { path: ROUTES.marketplace, element: <MarketplacePage /> },
        // ...
      ],
    },
  ]);
}
```

### 步骤 1.6：验证拆分后全部 13 个现有测试仍然通过

```
pnpm --filter @ai-hub/web test
```

如果有测试失败，请修正导入路径。

## 阶段 2：共享 API 客户端

### 步骤 2.1：创建 `shared/api/client.ts`

```ts
// shared/api/client.ts
const BASE = ""; // same-origin, no prefix needed

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail?: string,
    public readonly traceId?: string,
  ) {
    super(detail ?? code);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers as Record<string, string>,
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.code ?? "UNKNOWN",
      body.detail,
      body.traceId,
    );
  }

  return response.json() as Promise<T>;
}
```

## 阶段 3：认证模块

### 步骤 3.1：创建 `modules/auth/auth.client.ts`

调用 `/internal/login/password`、`/internal/logout`、`/internal/actor`。

### 步骤 3.2：创建 `modules/auth/auth.context.tsx`

提供 `ActorContext | null`、`login()`、`logout()`、`isLoading`、`error` 的 React 上下文。

### 步骤 3.3：创建 `modules/auth/useAuth.ts`

消费认证上下文的 hook。提供 `hasRole(code)`、`isAuthenticated` 等辅助函数。

### 步骤 3.4：在 `pages/auth/LoginPage.tsx` 构建登录页

员工工号 + 密码表单。接入 `/login` 路由。成功后重定向到应用市场。

## 阶段 4+：构建真实页面

每个领域遵循以下模式：

1. **模块 `.client.ts`** —— 使用 `apiFetch` 的类型化 API 调用
2. **模块 `use*.ts`** —— TanStack Query hooks（`useQuery`、`useMutation`）
3. **页面** —— 组合组件、调用 hooks、处理加载/错误/空状态

### 应用市场示例

```ts
// modules/marketplace/marketplace.client.ts
import { apiFetch } from "../../shared/api/client";
import type { CatalogEntry } from "@ai-hub/contracts";

export function searchCatalog(query: string): Promise<CatalogEntry[]> {
  return apiFetch(`/internal/catalog?q=${encodeURIComponent(query)}`);
}
```

```ts
// modules/marketplace/useCatalog.ts
import { useQuery } from "@tanstack/react-query";
import { searchCatalog } from "./marketplace.client";

export function useCatalogSearch(query: string) {
  return useQuery({
    queryKey: ["catalog", "search", query],
    queryFn: () => searchCatalog(query),
    enabled: query.length > 0,
  });
}
```

```tsx
// pages/marketplace/MarketplacePage.tsx
import { Input, Spin, Alert, List } from "antd";
import { useCatalogSearch } from "../../modules/marketplace/useCatalog";
import { useState } from "react";

export default function MarketplacePage() {
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = useCatalogSearch(query);

  return (
    <div>
      <Input.Search onSearch={setQuery} placeholder="搜索应用" />
      {isLoading && <Spin />}
      {error && <Alert type="error" message={error.message} />}
      {data && <List dataSource={data} renderItem={(app) => <AppCard app={app} />} />}
    </div>
  );
}
```

## 代码规范

- 仅 ESM，严格 TypeScript（继承自 `tsconfig.base.json`）
- 每个文件一个组件；页面默认导出，工具函数具名导出
- 布局/间距使用 Tailwind；交互元素使用 Ant Design 组件
- 不使用 `!important` 覆盖 Ant Design 内部样式
- 所有用户可见字符串使用中文
- 仅使用 Ant Design 图标（`@ant-design/icons`）
- 语义化 HTML：导航加 `aria-label`、标题层级、跳到 `#main-content` 的跳过链接
- 减少动效：尊重 `prefers-reduced-motion`
- 在 375、768、1024、1440px 下响应式适配

## 需要安装的包

```bash
cd apps/web
pnpm add react-hook-form @hookform/resolvers zod echarts echarts-for-react motion
```

## 成功标准

1. `pnpm --filter @ai-hub/web test` 通过（所有现有测试）
2. `pnpm --filter @ai-hub/web typecheck` 通过
3. `pnpm --filter @ai-hub/web build` 产出可用的构建产物
4. 没有超过 300 行的文件（拆分已验证）
5. 每个路由都有对应的页面文件
6. API 调用都经过 `shared/api/client.ts`
7. 业务逻辑位于 `modules/` 中，而不是 pages 或 components 中
