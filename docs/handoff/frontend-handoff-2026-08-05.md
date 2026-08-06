# 前端交接文档 — AI Hub 平台

**日期：** 2026-08-05
**交接对象：** Kimi K3（前端）
**交接方：** Claude Code（后端）
**分支：** `development`


## 1. 现有内容

### 后端（阶段 1–7 已完成）

所有 NestJS API 端点均已实现并通过测试。API 在 `/internal/*` 下提供服务，使用基于会话的认证。

| 领域 | 路由 | 用途 |
|--------|--------|---------|
| **身份** | `/internal/login/password`、`/internal/logout`、`/internal/actor`、`/internal/employees`、`/internal/departments`、`/internal/employees/:id/roles`、`/internal/employees/:id/revoke-sessions` | 认证、会话、用户/部门/角色列表 |
| **应用** | `/internal/applications`（17 个端点：CRUD、版本、四渠道交付、评审池、发布/撤回/归档/回滚） | 完整应用生命周期 |
| **目录** | `/internal/catalog`（搜索、列表、详情、交付动作记录） | 权限过滤的市场 |
| **互动** | `/internal/applications/:id/likes`、`/.../ratings`、`/.../comments`、`/.../reports` | 点赞、评分、回复、内容治理 |
| **创作者** | `/internal/creator/:applicationId/summary` | 版本差异、聚合统计 |
| **通知** | `/internal/notifications` | 应用内通知列表、已读状态 |
| **需求** | `/internal/demands`（17 个端点：草稿、评审、发布、认领、协作、优先级、进度、试点、合并、应用关联） | 创新需求生命周期 |
| **分析** | `/internal/analytics/dashboards`、`/internal/analytics/exports`、`/internal/analytics/assistant` | 9 个固定仪表盘、可审计导出、AI 助手 |

所有端点都要求 `x-employee-id` 请求头。错误响应遵循 `ProblemDetails` 结构：`{ type, title, status, code, detail, traceId }`。

### 前端（仅阶段 1 静态外壳）

当前前端是临时性的扁平 SPA —— 全部内容在两个文件中（`App.tsx` 10 行、`router.tsx` 957 行）。每个页面都渲染硬编码的占位内容，没有任何 API 调用。

**目标架构：** 一个完整分层的前端项目。当前文件需要拆分，而不是保留。

### 共享契约

```ts
import type { ActorContext, CatalogEntry, DemandEntry, HealthSnapshot, ProblemDetails } from "@ai-hub/contracts";
// Full type exports: packages/contracts/src/index.ts
```

### 技术栈（已配置）

| 包 | 版本 | 用途 |
|---------|---------|---------|
| react | 19.2 | UI 渲染 |
| react-dom | 19.2 | DOM 渲染 |
| react-router-dom | 6.30 | 客户端路由 |
| antd | 6.5 | 组件库 |
| @ant-design/icons | 6.1 | 图标集 |
| @tanstack/react-query | 5.90 | 服务端状态（已在 QueryClientProvider 中） |
| tailwindcss | 4.1 | 工具类 CSS（无 Preflight —— 不重置 Ant Design） |
| @tailwindcss/vite | 4.1 | Tailwind Vite 插件 |
| @vitejs/plugin-react | 4.7 | React 快速刷新 |
| vite | 6.4 | 构建工具 |
| vitest | 3.2 | 测试运行器 |
| @testing-library/react | 16.3 | 组件测试 |

需要安装的额外包（设计文档中已指定但尚未添加）：
- `react-hook-form` + `zod` + `@hookform/resolvers` —— 带校验的表单处理
- `echarts` + `echarts-for-react` —— 固定仪表盘
- `motion` —— 动画原语

## 2. 目标目录结构

```
apps/web/src/
├── main.tsx                        # entry: createRoot, render <App />
├── App.tsx                         # compose providers + router
├── styles.css                      # global styles, skip-link, reduced-motion
│
├── pages/                          # route-level page components (one file per route)
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
├── components/                     # shared/reusable UI components
│   ├── layout/
│   │   ├── AppShell.tsx            # skip-link, Header, nav, <Outlet />
│   │   ├── Header.tsx
│   │   └── Navigation.tsx
│   └── common/
│       ├── FeatureStatusPage.tsx
│       └── HealthSnapshotCard.tsx
│
├── modules/                        # domain-specific logic per feature
│   ├── auth/
│   │   ├── auth.context.tsx        # React context for current user
│   │   ├── useAuth.ts             # hook: actor, login, logout, roles
│   │   └── auth.client.ts         # API calls: login, logout, getActor
│   ├── marketplace/
│   │   ├── marketplace.client.ts   # API calls: search, list, detail
│   │   ├── useCatalog.ts          # TanStack Query hooks
│   │   └── types.ts               # module-specific types
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
│   ├── index.ts                    # createBrowserRouter with lazy routes
│   ├── routes.ts                   # route path constants (ROUTES.marketplace, etc.)
│   └── guards.ts                   # route guards (auth, role checks)
│
├── shared/
│   ├── api/
│   │   └── client.ts              # fetch wrapper: base URL, auth headers, error normalization
│   └── types/
│
└── test/
    ├── setup.ts
    ├── environment.ts
    └── icons.tsx
```

## 3. 架构规则

### 分层依赖图

```
pages ──► components ──► shared
  │           │
  └───────────┼──────► modules ──► shared
              │
              └──────► shared
```

| 层 | 允许 | 禁止 |
|-------|-----------|-------------|
| **pages/** | 从 `components/`、`modules/`、`router/routes`、`shared/` 导入 | 从其他页面导入；包含业务逻辑 |
| **components/** | 从 `shared/` 与其他组件导入 | 直接调用 API；从 `modules/` 导入（类型除外）；感知路由 |
| **modules/** | 从 `shared/` 导入；使用 TanStack Query | 导入 React 组件（上下文提供者除外）；从 `pages/` 或 `components/` 导入 |
| **router/** | 从 `pages/`（懒加载）导入 | 包含 UI |
| **shared/** | 仅标准库与共享包 | 从任何应用特定层导入 |


### 页面规则

- 每个文件一个 React 组件，默认导出
- 页面组合组件、调用模块 hook、处理加载/错误状态
- 页面绝不直接调用 `fetch` —— 始终通过模块 hook
- 页面文件名：列表视图用 `{Feature}Page.tsx`，详情视图用 `{Feature}DetailPage.tsx`


### 组件规则

- Props 接口与组件一起导出
- 组件通过 props 接收数据；绝不自行获取数据
- 共享组件放在 `components/common/`；布局组件放在 `components/layout/`
- 功能特定的复合组件可放在该功能的页面目录中


### 模块规则

- 每个模块通过其 index 文件（桶导出）暴露公共 API
- `.client.ts` 文件包含原始 `fetch` 调用，返回类型化响应
- `use*.ts` 文件将 `.client.ts` 调用包装为 TanStack Query hooks（`useQuery`、`useMutation`）
- 模块本地类型保留在模块内；跨模块类型放入 `shared/types/` 或使用 `@ai-hub/contracts`


### 路由规则

- 路由路径在 `router/routes.ts` 中定义为常量
- 所有路由使用 `lazy()` 进行代码分割
- `router/guards.ts` 中的认证守卫将未认证用户重定向

## 4. 认证流程

```
POST /internal/login/password
  Body: { employeeId, password, deviceLabel }
  Response: { actor: ActorContext, session: { sessionId, ... } }
  Cookie: session=<httpOnly-cookie> (set by server)

GET /internal/actor
  Headers: x-employee-id
  Response: ActorContext

POST /internal/logout
  Headers: x-employee-id
```

每个 API 调用都需要：`Cookie`（通过 `credentials: 'include'` 自动携带）+ `x-employee-id` 请求头。

## 5. 运行应用

```bash
# Full stack
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
# App at http://127.0.0.1:8080

# 仅前端开发（API 在别处运行）
cd apps/web && pnpm dev --host 0.0.0.0
```


## 6. 关键约束

- **同源** —— API 与 Web 由同一个 nginx 提供，无 CORS
- **CSRF** —— 生产环境要求 `x-csrf-token` 请求头（从 `csrf-token` cookie 读取）
- **不做全局状态转储** —— 服务端状态使用 TanStack Query；不要把员工/角色复制到巨型 store 中
- **错误结构** —— 所有错误都是 `ProblemDetails { code, title, detail, traceId }`
- **匿名内容** —— `displayAnonymously` 标记 → UI 显示“匿名用户”
- **受众过滤** —— 仅在服务端执行；前端绝不做客户端过滤
- **仅中文 UI** —— 所有用户可见文本使用简体中文
- **Ant Design + Tailwind** —— 交互控件用 Ant Design，布局/间距用 Tailwind；不使用 `!important` 覆盖
- **可访问性** —— 跳过链接、语义化标题、键盘导航、`prefers-reduced-motion`


## 7. 设计规格参考

完整规格见 `docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md`。前端相关关键章节：

- §4 —— 用户工作区（5 类用户及其可见内容）
- §5.6 —— 应用市场：搜索、筛选、排序、详情、交付动作
- §5.7 —— 互动：点赞、评分、评论、举报、匿名
- §5.9 —— 创新广场：需求表单、认领提案、进度时间线
- §5.10 —— 仪表盘：9 个固定仪表盘、KPI 卡片、图表类型
- §9 —— 前端模块结构、视觉设计、Ant Design + Tailwind 规则
- §9.4 —— 核心页面交互（发布向导、评审工作台、仪表盘）


## 8. 建议的构建顺序

1. **拆分** —— 把 `router.tsx` 拆分为 pages/、components/layout/、router/（不新增功能，保留所有测试）
2. **共享 API 客户端** —— `shared/api/client.ts`，含认证头与错误规范化
3. **认证模块** —— 登录页、认证上下文、`useAuth` hook、带用户展示的 Header
4. **应用市场** —— 第一个真实数据获取页面（使用目录 API）
5. **应用详情 + 交付** —— 从市场点击进入
6. **互动** —— 点赞、评分、评论（小型独立组件）
7. **通知中心** —— 带已读切换的简单列表
8. **创新广场** —— 需求表单、列表、详情
9. **发布向导** —— 多步骤表单（最复杂的 UI）
10. **仪表盘** —— ECharts 集成
11. **AI 助手** —— 聊天面板（最低优先级）


## 9. 参考文件

| 内容 | 位置 |
|------|-------|
| API 实现 | `packages/server/src/<domain>/<domain>.controller.ts` |
| 共享类型 | `packages/contracts/src/<domain>.ts` |
| 数据库 schema | `packages/database/src/schema.ts` |
| Ant Design 主题 | `packages/ui/src/theme.ts` |
| Vite 配置 | `apps/web/vite.config.ts` |
| 设计规格 | `docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md` |
| 阶段计划 | `docs/superpowers/plans/` |
| ADR | `docs/adr/` |
