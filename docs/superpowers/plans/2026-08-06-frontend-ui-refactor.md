# 前端页面样式与布局重构实施计划

> **给智能体工作者：** 必需子技能： superpowers:subagent-driven-development（推荐） 或 superpowers:executing-plans 逐任务实施本计划。 步骤使用复选框（`- [ ]`）语法跟踪。

**Goal:** 将 `apps/web` 重构为 `docs/ui-design/frontend-ui-design.md`（v1.0，权威 spec）要求的"固定 56px Header + 可收起 Sidebar + 面包屑内容区"管理后台布局，全页面统一简体中文与设计语言，并新增 AI 助手页骨架。

**Architecture:** 现有前端为 React 19 + antd v6 + Tailwind v4 + react-router v6 + react-query 的 monorepo（`apps/web`）。重构不改业务 API、数据 hook 与后端：先铺全局 token 与样式，再搭布局壳（Header/Sider/Content/面包屑），随后依次完成 Header、Sidebar 菜单、应用市场页、通用组件、各页面换壳中文化、AI 助手页，最后收口测试与视觉验证。

**技术栈?** React 19, TypeScript, antd v6 (`@ant-design/icons` v6), Tailwind CSS v4, react-router-dom v6, @tanstack/react-query, ECharts（现有看板）, pnpm + turbo。

**执行纪律（每任务通用）：**
- 所有 git 命令必须带 `git -c safe.directory=D:/workspace/AI-HUB-PLATFORM` 前缀（仓库存在 dubious ownership，不改用户全局 git 配置）。
- 当前分支 `codex/frontend-ui-refactor`；每个任务完成后提交（conventional commits，scope 用 `web` 或 `ui`，如 `feat(web): add app shell layout` / `style(web): unify marketplace cards`）。
- 每个任务结束时必须跑 `pnpm --filter @ai-hub/web lint`、`pnpm --filter @ai-hub/web typecheck`、`pnpm --filter @ai-hub/web test`，保持全绿（本任务相关断言可同步更新，但不得删减既有保护性断言）。
- 改动全部位于 `apps/web/src`、`packages/ui/src` 与测试文件；不得修改 `@ai-hub/contracts`、服务端代码、数据 hook 的请求签名。

## 全局约束

- 主操作色 `#1677ff`；页面背景 `#f5f5f5`；卡片 `#ffffff`；文字主要 `#1f1f1f`、次要 `#595959`、禁用 `#bfbfbf`；边框 `#d9d9d9`。
- 布局：Header 100% 宽、固定 56px、不滚动；Sidebar 默认 220px、收起 64px，撑满视口减 Header 高度，菜单过多内部滚动、底部公告固定；Content 撑满剩余宽高、超出纵向滚动。
- 断点：≥1200px 默认展开可手动收起；768–1199px 与 <768px 默认收起、点击展开为浮层。
- 动效 150–300ms，优先透明度/位移/颜色；支持 `prefers-reduced-motion`（`styles.css` 中现有基线必须保留）。
- 图标统一 `@ant-design/icons`；语言简体中文；字体系统默认中文（`"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Segoe UI", system-ui, sans-serif`）。
- 可访问性：skip-link 跳 `#main-content`（必须保留）；语义化标题层级；键盘导航焦点可见（`styles.css` 现有 `:focus-visible` 基线保留）；非颜色状态用图标+文字+颜色三重表达；交互区加 `aria-label`。
- 交互状态：页面首次加载 Skeleton；局部刷新 Spin；提交/操作中按钮 loading+disabled；网络/服务错误 Alert type="error" + 描述 + 重试按钮；空状态 Empty + 引导文案；无权限 Result 403；资源不存在 Result 404。
- 测试图标白名单：新用到的 `@ant-design/icons` 必须同步加入 `apps/web/src/test/icons.tsx`（该文件被 vitest alias 使用，缺失会 import 报错）。
- 不伪造数据：无公告 API 时公告区显示"暂无公告"；钉钉 OAuth 未配置时点击提示"钉钉登录暂未配置，请联系管理员"；交付动作接口未接入时"开始使用"按钮置灰并提示。

---

### Task 1: 主题与全局样式

**文件?**
- 修改? `packages/ui/src/theme.ts`
- 修改? `apps/web/src/styles.css`
- 测试? `apps/web/src/App.test.tsx`（reduced-motion 断言不得改动）

**接口?**
- 产出? `aiHubTheme: ThemeConfig`（保持 `packages/ui/src/index.ts` 的 `export { aiHubTheme } from "./theme.js"` 不变，`providers.tsx` 消费方式不变）。
- 消费? 无（只改 token 与 CSS）。

**步骤?**
- [ ] 在 `packages/ui/src/theme.ts` 的 `token` 中补充：`colorPrimary: "#1677ff"`、`colorText: "#1f1f1f"`、`colorTextSecondary: "#595959"`、`colorTextDisabled: "#bfbfbf"`、`colorBorder: "#d9d9d9"`、`colorBorderSecondary: "#f0f0f0"`、`colorBgLayout: "#f5f5f5"`、`colorBgContainer: "#ffffff"`、`colorBgElevated: "#ffffff"`、`borderRadius: 6`、`controlHeight` 保持默认；保留现有 `cssVar: {}`、`fontFamily`、`motionDurationFast/Mid/Slow`。
- [ ] 在 `apps/web/src/styles.css` 的 `:root` 中补充设计 token CSS 变量：`--color-primary:#1677ff; --color-bg-page:#f5f5f5; --color-bg-card:#ffffff; --color-text-primary:#1f1f1f; --color-text-secondary:#595959; --color-text-disabled:#bfbfbf; --color-border:#d9d9d9;` 并在 `body`/`html` 背景引用 `#f5f5f5`（可改用变量）。
- [ ] 保留 `@media (prefers-reduced-motion: reduce)` 块、`:focus-visible` 块、`.skip-link` 样式（内容可微调，行为不变）。
- [ ] 可顺手加全局滚动条样式（细滚动条、`#d9d9d9` 轨道、`#bfbfbf` 滑块），非必需但鼓励，保持中性、不引入外链字体。
- [ ] 提交：`style(ui): add design tokens to antd theme and global css`

**测试?**
- [ ] `pnpm --filter @ai-hub/web test` 全绿（App.test 的 reduced-motion 断言原样通过）。
- [ ] `pnpm --filter @ai-hub/web typecheck`、`lint` 通过。

**Acceptance:** token 与 CSS 变量与 Global Constraints 色板一一对应；无行为回归。

---

### Task 2: 布局壳与面包屑

**文件?**
- 修改? `apps/web/src/components/layout/AppShell.tsx`
- 修改? `apps/web/src/router/routes.ts`（新增 `ROUTES.assistant` 与面包屑元表）
- 创建? `apps/web/src/components/layout/Breadcrumbs.tsx`
- 创建? `apps/web/src/components/layout/useBreadcrumbs.ts`
- 修改? `apps/web/src/router/index.tsx`（登录页移出 AppShell，置于根路由）
- 测试? `apps/web/src/App.test.tsx`（更新面包屑/结构断言；banner 高度断言到 Task 3 再改）

**接口?**
- 产出?
  - `ROUTES.assistant = "/assistant"`（追加到 `routes.ts` 现有 `ROUTES` 对象）。
  - `ROUTE_META: ReadonlyArray<{ path: string; labels: readonly string[] }>`，顺序为最具体优先；用 `react-router-dom` 的 `matchPath` 匹配（`path` 复用 ROUTES 中的参数化写法）。
  - `useBreadcrumbs(): readonly string[]` — 按 `location.pathname` 匹配 `ROUTE_META`，返回 labels；无匹配返回 `[]`。
  - `Breadcrumbs` 组件：antd `Breadcrumb`，自动加"首页→应用市场"前置项（当 labels 首项不是"应用市场"时，前置 `应用市场` 并链接 `/marketplace`），最后一项为当前页文字（不可点）。
- 消费? 现有 `Header`、`Navigation` 组件原样保留（本任务不重写它们）。

**步骤?**
- [ ] `routes.ts`：追加 `assistant: "/assistant"`；新增 `ROUTE_META`：`/marketplace → [应用市场]`；`/marketplace/:applicationId → [应用市场, 应用详情]`；`/innovation → [创新广场]`；`/innovation/:demandId → [创新广场, 需求详情]`；`/applications → [应用管理]`；`/applications/:applicationId → [应用管理, 应用详情]`；`/applications/:applicationId/versions → [应用管理, 版本管理]`；`/applications/:applicationId/review → [应用管理, 审核工作台]`；`/applications/:applicationId/delivery → [应用管理, 交付配置]`；`/creator/:applicationId → [创作者中心]`；`/analytics → [数据看板]`；`/organization → [组织管理]`；`/security → [系统安全]`；`/notifications → [站内通知]`；`/assistant → [AI 助手]`。
- [ ] 新建 `useBreadcrumbs.ts`：用 `useLocation` + `matchPath`（`{ path, end: true }`）遍历 `ROUTE_META`，返回首个匹配的 `labels`。
- [ ] 新建 `Breadcrumbs.tsx`：渲染 antd `Breadcrumb`，`aria-label="面包屑"`，空 labels 时返回 `null`。
- [ ] 重写 `AppShell.tsx`：外层 antd `Layout`（背景 `#f5f5f5`）；顶部 `<Header />` 保持现状；其下 antd `Layout` 内：左侧 `Sider`（`width=220`、`collapsedWidth=64`、`theme="light"`、`trigger={null}`、白色背景、右边框），Sider 内渲染现有 `<Navigation />`（临时承接，Task 4 再重写）；右侧 `Content`（`id="main-content"`、`tabIndex={-1}`、`overflow-y:auto`、`padding` 24px、`min-h-0`），Content 顶部先渲染 `<Breadcrumbs />`（`margin-bottom` 16px），其下 `<Suspense fallback={<Spin />}>` 包 `<Outlet />`；保留 skip-link（`href="#main-content"`）。Sider 收起按钮本任务可先不实现（Task 4 负责折叠），但布局骨架（220/64 宽度、白色、边框）必须就位。
- [ ] `router/index.tsx`：把 `LoginPage` 路由从 `AppShell` children 移到顶层根路由（与 `AppShell` 平级）；`RequireAuth` 结构不变。
- [ ] 提交：`feat(web): add admin shell layout with breadcrumbs`

**测试?**
- [ ] 更新 `App.test.tsx`：保留 skip-link/reduced-motion/导航断言；新增或更新断言：市场页渲染面包屑（`getByRole("navigation", { name: "面包屑" })` 存在）、`main-content` 存在且 `tabindex=-1`。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** 登录页不再被 Header/Sider 包裹；所有已登录页面出现面包屑；`ROUTES.assistant` 已注册（页面 Task 10 再挂）。

---

### Task 3: Header（Logo/搜索/通知/用户菜单）

**文件?**
- 修改? `apps/web/src/components/layout/Header.tsx`（重写）
- 创建? `apps/web/src/modules/marketplace/search.store.ts`
- 创建? `apps/web/src/modules/application/last-viewed.ts`
- 修改? `apps/web/src/App.test.tsx`（banner 高度断言、搜索框断言）
- 测试? `apps/web/src/phase4.test.tsx`（搜索框 aria 名称保持"搜索应用"）

**接口?**
- 产出?
  - `readSearchQuery(): string` — 读 `location.search` 的 `q`（`URLSearchParams`），返回字符串。
  - `searchPath(value: string): string` — 返回 `/marketplace`（value 非空时附 `?q=${encodeURIComponent(value)}`）。
  - `readLastViewedApplicationId(): string | undefined` — 读 sessionStorage `ai-hub.last-application`。
- 消费? `useAuth()`（`actor.employeeId`、`logout`、`isLoading`）、`useNotifications()`（未读数 = `readAt === null` 的条数）、`readLastViewedApplicationId`。

**步骤?**
- [ ] `search.store.ts`：实现上述两个函数（纯函数 + `window.location`）。
- [ ] `last-viewed.ts`：定义常量 `LAST_VIEWED_APPLICATION_KEY = "ai-hub.last-application"` 与 `readLastViewedApplicationId()`（sessionStorage 容错 try/catch）；Task 9 再补写入函数。
- [ ] 重写 `Header.tsx`：antd `Layout.Header` 固定 56px（`style={{ height: 56, lineHeight: "56px", padding: "0 16px", background: "#fff" }}` + 下边框 `#d9d9d9`），内部 flex 三段：
  - 左：点击回 `/marketplace` 的 Link（`aria-label="返回应用市场"`）：`AppstoreOutlined` 图标 + 文案「AI 应用市场」（font-weight 600）。
  - 中：仅 `location.pathname === "/marketplace"` 时渲染 `Input.Search`（`aria-label="搜索应用"`、`allowClear`、宽 400px（响应式 `w-full max-w-[400px]`）、圆角、占位"搜索应用名称、标签、场景…"）；`onSearch` 时 `navigate(searchPath(value))`；`defaultValue={readSearchQuery()}`。其余页面中部留空（`flex-1`）。
  - 右：`Badge count={未读数}` 包 `Button type="text" aria-label="消息通知"`（`BellOutlined`），点击开 `Popover`（`title="通知"`，内容：最近 5 条未读（`readAt === null`，取前 5），每条显示 message 单行截断，空则"暂无新通知"；底部 Link「查看全部通知」→ `/notifications`）；用户 `Dropdown`（`menu` 模式）：显示 `actor?.employeeId ?? "未登录"` + `DownOutlined`；菜单项：`我的应用 → /applications`、`创作者中心 → readLastViewedApplicationId() 有值则 /creator/:id，否则 disabled`、`账号安全 disabled（tooltip 后续版本）`、分隔线、`退出登录`（点击 `Modal.confirm`：标题"确认退出登录？"，确认后 `await logout()` 再 `navigate(ROUTES.login)`）。Header 不再渲染 `<Navigation />`（Navigation 由 Task 2 已移入 Sider）。
- [ ] 提交：`feat(web): rebuild header with search, notifications and user menu`

**测试?**
- [ ] `App.test.tsx`：将"responsive header size itself to its content"改为断言 banner 高度 `56px`（`toHaveStyle({ height: "56px" })`）；保留导航/面包屑断言（导航在 Sider 内）。
- [ ] `phase4.test.tsx`：搜索框断言改为 Header 中 `getByRole("searchbox", { name: "搜索应用" })`（原断言名称不变，位置变化不影响测试）。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** Header 恒 56px；市场页有居中搜索且能跳 `?q=`；通知 Badge/Popover 与用户 Dropdown 行为符合上述定义；Navigation 不在 Header 内。

---

### Task 4: Sidebar 菜单（角色过滤/折叠/公告）

**文件?**
- 修改? `apps/web/src/components/layout/Navigation.tsx`（重写为侧边栏菜单）
- 创建? `apps/web/src/modules/auth/roles.ts`
- 修改? `apps/web/src/components/layout/AppShell.tsx`（折叠状态、折叠按钮、移动端 Drawer、公告区）
- 修改? `apps/web/src/test/icons.tsx`（新增本任务用到的图标）
- 测试? `apps/web/src/App.test.tsx`、`identity-admin.test.tsx`（导航名称断言不变：应用市场/创新广场/站内通知/Organization→本任务暂不改文案，Task 7/9 再改）

**接口?**
- 产出?
  - `roles.ts`：`ROLE_APP_ADMIN = "application_admin"`、`ROLE_ORG_ADMIN = "organization_admin"`、`ROLE_SUPER_ADMIN = "super_admin"`、`ROLE_INNOVATION_ADMIN = "innovation_admin"`；`canSeeMenu(actor: ActorContext | null, allowedRoles: readonly string[]): boolean` — actor 为 null 返回 true（回退全部可见），否则 `allowedRoles.some(code => actor.roleCodes.includes(code))`。
  - `Navigation` 导出 `menuItems: ReadonlyArray<{ key: string; label: string; icon: ReactNode; path?: string; allowedRoles?: readonly string[] }>`。
  - 折叠状态 key：localStorage `ai-hub.sidebar.collapsed`。
- 消费? `useAuth()`（`actor`）、`readLastViewedApplicationId()`（审核工作台入口）。

**步骤?**
- [ ] `roles.ts` 实现上述常量与 `canSeeMenu`。
- [ ] 重写 `Navigation.tsx`：`<nav aria-label="主导航">` + antd `Menu`（`mode="inline"`、`theme="light"`、`selectedKeys` 按当前 `location.pathname` 前缀匹配）。菜单项（label/icon/route/roles）：
  - 应用市场 `AppstoreOutlined` → `/marketplace`（全员）
  - 创新广场 `ExperimentOutlined` → `/innovation`（全员）
  - 应用管理 `AppstoreAddOutlined` → `/applications`（`[application_admin, super_admin]`）
  - 审核工作台 `CheckCircleOutlined` → `readLastViewedApplicationId()` 有值时 `/applications/:id/review`，否则 disabled（`title="请先在应用管理选择应用"`）（`[application_admin, super_admin]`）
  - 数据看板 `DashboardOutlined` → `/analytics`（`[application_admin, organization_admin, super_admin, innovation_admin]`）
  - 组织管理 `TeamOutlined` → `/organization`（`[organization_admin, super_admin]`）
  - 系统安全 `SafetyCertificateOutlined` → `/security`（`[super_admin]`）
  - AI 助手 `RobotOutlined` → `/assistant`（全员）
  - 站内通知 `CheckCircleOutlined` 或 `BellOutlined` → `/notifications`（全员）
  - 菜单过滤：`canSeeMenu(actor, item.allowedRoles ?? [])`。
  - 激活态依赖 antd Menu 内置样式 + 覆盖 token：选中项背景 `#e6f4ff`、文字 `#0958d9`、左侧 3px 蓝色指示条（antd `Menu` 默认即有侧条，用 `theme` token 覆盖 `colorPrimary` 即可）；hover 浅灰。
- [ ] `AppShell.tsx`：接管折叠状态——`const [collapsed, setCollapsed] = useState(...)`（初始：`matchMedia("(max-width:1199px)")` 匹配则 true，否则读 localStorage，缺省 false）；`Sider collapsed={collapsed} collapsedWidth={64} width={220}`，`onCollapse` 写入 localStorage；Sider 底部（`Menu` 之后）渲染折叠按钮 `Button type="text" aria-label="收起菜单"/"展开菜单"`（`MenuFoldOutlined`/`MenuUnfoldOutlined`）；`<1200px` 时不渲染 Sider，改为 `Drawer`（`placement="left"`、`width=220`、`closable`、`open` 由 Header 汉堡按钮控制——Header 在移动端显示 `MenuUnfoldOutlined` 按钮并回调；可在 `AppShell` 内用一个 state `drawerOpen`，通过 context 或 props 传给 Header；最简单：Header 保留本地按钮 + 自定义事件/context，采用 `createContext` 在 `AppShell` 内新建 `SidebarContext`（`{ drawerOpen, setDrawerOpen }`）并在 Header 消费，或直接用 `react-router` location 变化时关闭 Drawer）。
  - 简化且可落地的方案：`AppShell` 定义 `const [drawerOpen, setDrawerOpen] = useState(false)`；`Header` 接收可选 prop `onMenuClick?: () => void` 与 `mobileMenuVisible?: boolean`（AppShell 渲染 Header 时传入）；`matchMedia("(max-width:1199px)")` 变化时通过 `useEffect` + `addEventListener("change")` 切换 Sider/Drawer。
- [ ] 公告区：Sider 底部（折叠按钮上方）固定区域：`SoundOutlined`（橙色 `#fa8c16`）+「平台公告」小标题 + 单行摘要；无数据时显示"暂无公告"（`aria-label="平台公告"`）。
- [ ] `icons.tsx` 补充：`MenuFoldOutlined`、`MenuUnfoldOutlined`、`SoundOutlined`、`RobotOutlined`、`TeamOutlined`、`DashboardOutlined`、`AppstoreAddOutlined`、`BellOutlined`、`UserOutlined`（以及本任务/后续任务 import 的其它图标，以实际 import 为准）。
- [ ] 提交：`feat(web): add role-aware collapsible sidebar with announcement area`

**测试?**
- [ ] 现有导航相关测试保持通过（应用市场/创新广场/站内通知 link 仍在）；`identity-admin.test.tsx` 的 Organization/Security 点击仍通过（actor 为 null 回退全显）。
- [ ] 新增或更新一条断言：`/assistant` 菜单项存在。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** 菜单按角色过滤（actor null 回退全显）；Sider 可折叠且状态持久化；移动端 Drawer 打开关闭正常；公告区固定底部。

---

### Task 5: 应用市场页

**文件?**
- 修改? `apps/web/src/pages/marketplace/MarketplacePage.tsx`
- 修改? `apps/web/src/pages/marketplace/MarketplaceHero.tsx`（改为排序标签条）
- 修改? `apps/web/src/pages/marketplace/MarketplaceFilters.tsx`
- 修改? `apps/web/src/pages/marketplace/AppCard.tsx`
- 修改? `apps/web/src/pages/marketplace/MarketplaceSidebar.tsx`
- 修改? `apps/web/src/test/icons.tsx`（如需新图标）
- 测试? `apps/web/src/phase4.test.tsx`

**接口?**
- 产出? `MarketplaceSortMode = "recommended" | "latest" | "popular"`（删除 `"rating"`）；`MarketplaceFilters` 的 `tagIds` 改为 `string[]` 多选。
- 消费? `readSearchQuery()`（初始 query）、`useCatalogSearch`（`refetch` 用于重试）、`useDepartments()`。

**步骤?**
- [ ] `MarketplacePage.tsx`：删除页面内 `Input.Search`（搜索已在 Header）；`const [query, setQuery] = useState(() => readSearchQuery())`；`serverSort = sortMode`（`recommended/latest/popular` 直传）；标签过滤改为 `tagIds: string[]`（`tagIds.includes`）；新增 `const { refetch } = useCatalogSearch(...)` 用于错误重试；右侧栏传 `onTagSelect(tagId)` 回调（把标签加入/移出 tagIds）；状态区：
  - loading → `<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">` 内渲染 6 个 `SkeletonCard`（Task 6 组件；本任务可先用 antd `Skeleton` 卡片占位，Task 6 落地后替换）。
  - error → antd `Alert type="error" title="应用列表加载失败"` + `Button onClick={() => void refetch()}` 重试。
  - empty → antd `Empty description="没有符合条件的已发布应用"`。
  - 全部加载 → 隐藏"加载更多"，显示"已展示全部 N 个应用"。
- [ ] `MarketplaceHero.tsx`：去掉大渐变 hero 与"最新上架/热门应用/管理员推荐"三按钮；改为横向排序标签条：`推荐`/`最新`/`热门`（`recommended`/`latest`/`popular`），当前项蓝色下划线或蓝色文字（`#1677ff`），`aria-pressed`。
- [ ] `MarketplaceFilters.tsx`：保留 分类/应用类型/部门 Select 与 重置；标签改为 `Select mode="multiple"`（`allowClear`，`value={tagIds}`，`onChange={(v: string[]) => onTagChange(v)}`）；"排序与类型"第二行按钮组删除（排序已移到 Hero），渠道按钮组保留或删除均可（渠道筛选已由 Select 承担——删除按钮组，避免重复）。
- [ ] `AppCard.tsx`：整卡包 `<Link to={detailPath}>`（`aria-label={`查看应用 ${entry.name}`}`），移除"立即使用"按钮，保留"查看详情"文字按钮或直接省略按钮（卡片即链接）；hover：`hover:shadow-md hover:border-[#91caff]`；其余内容（图标/名称/两行摘要/部门/评分点赞/信任标签/渠道）保留。
- [ ] `MarketplaceSidebar.tsx`：区块改为 ①管理员推荐位（`items.filter(i => i.trustLabels.includes("recommended")).slice(0,5)`，空则"暂无推荐"）②热门标签云（现有 topTags，点击回调 `onTagSelect(tagId)` 切换筛选，`aria-pressed`）③最新上架（现有 `latest` 5 条）；删除"使用指南"区块。
- [ ] 提交：`style(web): rework marketplace page to design spec`

**测试?**
- [ ] `phase4.test.tsx`：`搜索应用` searchbox 断言保留（Header 中）；`最新上架`/`热门应用`→ 若文案改为"最新上架"/"热门标签"，同步更新断言；`已验证`、`平台助手` 保留。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** 市场页与文档 §5 布局一致：排序标签、四筛选项+重置、3/2/1 卡片网格、右侧三区块、四种状态齐全。

---

### Task 6: 通用组件

**文件?**
- 创建? `apps/web/src/components/common/ErrorBlock.tsx`
- 创建? `apps/web/src/components/common/EmptyBlock.tsx`
- 创建? `apps/web/src/components/common/ForbiddenBlock.tsx`
- 创建? `apps/web/src/components/common/NotFoundBlock.tsx`
- 创建? `apps/web/src/components/common/SkeletonCard.tsx`
- 创建? `apps/web/src/components/common/SkeletonDetail.tsx`
- 创建? `apps/web/src/components/common/KpiCard.tsx`
- 创建? `apps/web/src/components/common/StatCard.tsx`
- 创建? `apps/web/src/components/common/ConfirmModal.tsx`
- 创建? `apps/web/src/components/common/index.ts`（统一导出）

**接口?**
- Produces（全部命名导出）：
  - `ErrorBlock({ title?, description, onRetry? })`：Alert type="error" + 可选重试按钮。
  - `EmptyBlock({ description, action? })`：antd Empty + 可选操作。
  - `ForbiddenBlock({ description? })`：antd `Result status="403"` 标题"没有访问权限"，副文案默认"您没有访问此页面的权限"，按钮"返回首页"→ `/marketplace`。
  - `NotFoundBlock({ description? })`：antd `Result status="404"` 标题"页面不存在"，按钮"返回上一页"（`window.history.back()`）与"返回首页"。
  - `SkeletonCard({ count? })`：`count` 张 `Skeleton` 卡片（`Card` + `Skeleton active` 模拟图标/标题/两行文本）。
  - `SkeletonDetail({})`：详情页骨架（头部 + 两个区块）。
  - `KpiCard({ icon, label, value, trend? })`：卡片 = 图标 + 数值 + 标题 + 可选趋势文案。
  - `StatCard({ icon, label, value })`：KpiCard 的简化（无趋势）。
  - `ConfirmModal({ buttonText, title, content, okText?, danger?, onOk, buttonProps? })`：渲染一个按钮，点击弹 `Modal.confirm`，确认后调 `onOk()`。

**步骤?**
- [ ] 逐一创建上述组件（纯展示组件，antd 组件 + Tailwind 类名，无业务数据依赖）。
- [ ] `index.ts` 统一 `export * from "./..."`。
- [ ] 将 Task 5 中市场页临时 Skeleton 占位替换为 `SkeletonCard`。
- [ ] 提交：`feat(web): add shared page state and stat components`

**测试?**
- [ ] 全套件 + lint + typecheck 通过（这些组件由后续任务页面使用并覆盖；本任务至少保证 typecheck 与 lint 干净）。

**Acceptance:** 组件签名与上述一致；后续任务可直接 import 使用。

---

### Task 7: 应用管理组中文化与换壳

**文件?**
- 修改? `apps/web/src/components/common/ApplicationAdminPage.tsx`
- 修改? `apps/web/src/pages/applications/ApplicationsPage.tsx`
- 修改? `apps/web/src/pages/applications/ApplicationDetailsPage.tsx`
- 修改? `apps/web/src/pages/applications/ApplicationVersionsPage.tsx`
- 修改? `apps/web/src/pages/applications/ApplicationReviewPage.tsx`
- 修改? `apps/web/src/pages/applications/ApplicationDeliveryPage.tsx`
- 测试? `apps/web/src/App.test.tsx`（应用路由/生命周期断言）

**接口?**
- 消费? `ErrorBlock`、`EmptyBlock`。
- 产出? `ApplicationAdminPage` 新 props 不变（`{ title, description, children }`），内部改为中文页签 + 只读提示；页签 label：应用详情/版本管理/审核工作台/交付配置。

**步骤?**
- [ ] `ApplicationAdminPage.tsx`：`title`/`description` 由页面传入中文；`ApplicationNavigation` 文案改为：应用详情/版本管理/审核工作台/交付配置（路径不变）；只读 Alert 文案：title "只读预览"，description 保留"数据已通过内部 API 接入；当前界面不提供写操作。"；页签激活态沿用 antd 样式。
- [ ] `ApplicationsPage.tsx`：title "应用管理"、description "统一管理应用发布、版本、审核与交付配置。"；正文保持现有查询表单/详情卡片，但卡片标题与文案中文化（"查看应用详情"等），输入框 aria-label 保持"应用 ID"。
- [ ] `ApplicationDetailsPage.tsx`：title "应用详情"；生命周期状态标签改为：草稿/审核中/已通过/已上架/已驳回/已下架/已归档（`statusLabel` 同步）；"Published version"→"当前版本"；"Current state"→"当前状态"；错误/加载用 `ErrorBlock`/`Spin`。
- [ ] `ApplicationVersionsPage.tsx`：title "版本管理"；"Version history"→"版本历史"；"Published"→"当前版本"；scan 标签保持中文（校验通过/校验失败/校验中）；页尾说明中文化。
- [ ] `ApplicationReviewPage.tsx`：title "审核工作台"；"Review history"→"审核记录"；decision 标签：通过/驳回/请求变更。
- [ ] `ApplicationDeliveryPage.tsx`：title "交付配置"；"Delivery channels"→"交付渠道"；Enabled/Disabled→已启用/未启用；channelTitle 中文化（Web 应用/桌面端/移动端/小程序）。
- [ ] 提交：`style(web): localize application admin pages`

**测试?**
- [ ] `App.test.tsx` 更新：应用路由 headings → 应用详情/版本管理/审核工作台/交付配置；应用详情页生命周期标签断言 → 草稿/审核中/已通过/已上架/已驳回/已下架/已归档/当前版本；"数据已通过内部 API 接入；当前界面不提供写操作。" 断言保留。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** 五个页面中文标题与统一卡片/状态组件；既有行为不变。

---

### Task 8: 创新/创作者/看板组中文化与换壳

**文件?**
- 修改? `apps/web/src/pages/innovation/InnovationSquarePage.tsx`
- 修改? `apps/web/src/pages/innovation/InnovationDemandDetailPage.tsx`
- 修改? `apps/web/src/pages/creator/CreatorCenterPage.tsx`
- 修改? `apps/web/src/pages/analytics/AnalyticsDashboardPage.tsx`
- 测试? `apps/web/src/App.test.tsx`（创新页断言）、`apps/web/src/phase6.test.tsx`

**接口?**
- 消费? `KpiCard`、`StatCard`、`ErrorBlock`、`EmptyBlock`。

**步骤?**
- [ ] `InnovationSquarePage.tsx`：需求卡片保持，搜索/加载/错误/空状态改用统一组件（错误 `ErrorBlock` + `refetch`，空 `EmptyBlock description="当前受众范围内没有可见需求"`）；`useDemandList` 结果需带 `refetch`（现有 hook 已有）。
- [ ] `InnovationDemandDetailPage.tsx`：加载中 `SkeletonDetail`；错误 `ErrorBlock`；卡片布局微调（统一圆角/边框/间距），文案保持。
- [ ] `CreatorCenterPage.tsx`：3 个统计卡改用 `StatCard`/`KpiCard`（交付/点赞/评分）；版本差异与自动校验报告区块保持内容、换统一卡片样式。
- [ ] `AnalyticsDashboardPage.tsx`：9 张卡片标题中文化：平台总览/市场采用分析/应用组合分析/创新需求漏斗/审核治理/部门采用/风险治理/系统运行/集成质量（`dashboardKey` 不变，仅 title/description 文案）；Alert 文案中文化。
- [ ] 提交：`style(web): localize innovation, creator and analytics pages`

**测试?**
- [ ] `App.test.tsx` 创新广场断言：标题"创新广场"、"结构化需求与受众治理"保留，"查看需求详情"链接保留。
- [ ] `phase6.test.tsx`：heading 改"数据看板"；Platform/Market/Application/Innovation 断言改为中文标题；"Numbers are rebuildable..." 文案断言更新为中文描述。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** 三组页面中文标题、统一状态组件与卡片样式；数据 hook 与看板 key 不变。

---

### Task 9: 组织/安全/通知/市场详情/登录页组

**文件?**
- 修改? `apps/web/src/pages/organization/OrganizationPage.tsx`
- 修改? `apps/web/src/pages/security/SecurityPage.tsx`
- 修改? `apps/web/src/pages/notifications/NotificationsPage.tsx`
- 修改? `apps/web/src/pages/marketplace/MarketplaceDetailPage.tsx`
- 修改? `apps/web/src/pages/auth/LoginPage.tsx`
- 修改? `apps/web/src/modules/application/last-viewed.ts`（补写入函数）
- 测试? `apps/web/src/identity-admin.test.tsx`、`apps/web/src/auth.test.tsx`

**接口?**
- 产出? `last-viewed.ts` 追加 `rememberLastViewedApplicationId(id: string): void`（sessionStorage 写入，try/catch 容错）。
- 消费? `ErrorBlock`、`EmptyBlock`、`ConfirmModal`、`rememberLastViewedApplicationId`。

**步骤?**
- [ ] `OrganizationPage.tsx`：title "组织管理"、description "员工与部门数据来自内部身份 API，当前为只读视图。"；两张表卡片化保持；错误 `ErrorBlock`。
- [ ] `SecurityPage.tsx`：title "系统安全"、description "当前登录身份、角色与部门授权来自内部身份 API；会话可在此处退出。"；退出登录按钮保留（可用 `ConfirmModal`）。
- [ ] `NotificationsPage.tsx`：列表卡片化（统一圆角/边框/间距）；空状态改 `EmptyBlock description="暂无通知"`；错误 `ErrorBlock`；加载 `Spin`。不新增"全部标记已读"等未实现能力。
- [ ] `MarketplaceDetailPage.tsx`：挂载时 `rememberLastViewedApplicationId(applicationId)`（`useEffect`）；加载 `SkeletonDetail`；错误 `ErrorBlock`（404 语义用 `NotFoundBlock`）；"开始使用"主按钮：`type="primary"`，`disabled` + `title="交付动作接口待接入"`（按渠道文案可保留在交付卡片）；点赞/评分区保留。
- [ ] `LoginPage.tsx`：独立居中卡片布局（antd `Card`，`max-w-md` 居中，上下留白）；顶部 Logo 图标 + "AI 应用市场"（`AppstoreOutlined`）+ 副标题"企业内部 AI 应用共享平台"；标题 h1 "员工登录"；表单字段 label "员工工号"/"密码"（占位符"工号 / 邮箱"）；登录按钮 loading；分隔线（antd `Divider plain` "或"）；"钉钉扫码登录"按钮（`type="default"`，点击 `message.info("钉钉登录暂未配置，请联系管理员")`）；底部 Text "首次使用？请联系管理员开通账号"；现有 `zod` 校验与错误 Alert 保留。
- [ ] 提交：`style(web): localize remaining pages and rebuild login layout`

**测试?**
- [ ] `identity-admin.test.tsx`：点击链接改为 组织管理/系统安全，heading 断言改为 组织管理/系统安全。
- [ ] `auth.test.tsx`：heading "员工登录"、label "员工工号"/"密码"、表单 aria "登录表单" 断言保持通过（这些文案未变）。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** 组织/安全/通知/详情/登录五页符合文档 §16/§17/§18/§6/§19 的页面层级与文案；最近查看应用被记录，Header/菜单入口可用。

---

### Task 10: AI 助手页

**文件?**
- 创建? `apps/web/src/pages/assistant/AssistantPage.tsx`
- 修改? `apps/web/src/router/index.tsx`（懒加载注册 `/assistant`）
- 修改? `apps/web/src/test/icons.tsx`（如缺图标）
- 测试? 新增 `apps/web/src/assistant.test.tsx` 或在 `App.test.tsx` 加断言

**接口?**
- 消费? `ROUTES.assistant`。
- 产出? 默认导出 `AssistantPage`。

**步骤?**
- [ ] `AssistantPage.tsx`：聊天界面（白色卡片，`min-h-[560px]`）：
  - 空状态：居中 `RobotOutlined`（紫色 `#722ed1`）+ 标题 "AI 助手" + 副文案"我可以帮助您搜索和推荐合适的应用" + 3 个示例问题快捷按钮（"有什么适合数据分析的应用？"、"帮我找协作办公类应用"、"推荐最近上架的应用"），点击后填入输入框并发送。
  - 消息列表：用户消息右对齐（蓝色气泡 `#e6f4ff`/`#1677ff`），AI 消息左对齐（灰底，`RobotOutlined` 紫色标识）；消息仅存组件本地 state（不持久化）。
  - 输入区：`Input.TextArea`（Enter 发送、Shift+Enter 换行）+ 发送按钮（`SendOutlined` 或"发送"），发送后追加用户消息，并追加 AI 回复 Alert："AI 助手暂时不可用，请稍后重试"（降级提示，`type="warning"`）。
- [ ] `router/index.tsx`：`const AssistantPage = lazy(() => import("../pages/assistant/AssistantPage"));`，注册 `{ element: <AssistantPage />, path: ROUTES.assistant }`。
- [ ] 提交：`feat(web): add assistant page skeleton`

**测试?**
- [ ] 新增测试：渲染 `/assistant` 出现"AI 助手"标题与示例问题按钮；点击示例问题后出现降级提示"AI 助手暂时不可用，请稍后重试"。
- [ ] 全套件 + lint + typecheck 通过。

**Acceptance:** `/assistant` 可访问；空状态/消息/降级提示符合文档 §20（本地 state，无后端）。

---

### Task 11: 测试收口与验证

**文件?**
- 修改? `apps/web/src/test/icons.tsx`（补全所有新图标白名单）
- 修改? 相关测试文件（保证中文文案断言与实现一致）
- 修改? `processing_visualization.html`（根目录，见下方必填内容）

**步骤?**
- [ ] 全量检查 `apps/web/src` 中 import 的 `@ant-design/icons` 均已在 `src/test/icons.tsx` 注册（跑一次测试验证）。
- [ ] 逐个跑 `pnpm --filter @ai-hub/web lint`、`typecheck`、`test`，修复所有失败（文案不一致、aria 名称、结构断言）。
- [ ] 视觉验证：启动 `pnpm --filter @ai-hub/web dev`（后台，`Start-Process` 隐藏窗口），用 App 内浏览器打开本地地址（vite 默认 http://localhost:5173），逐屏核对：登录页、市场页（排序/筛选/卡片/右侧栏/骨架/空/错误态）、应用管理、数据看板、AI 助手、站内通知；核对 §1.4 色板与文档线框；修复明显布局偏差（间距/圆角/截断/对齐）。API 未启动时至少核对静态布局与状态组件。核对后停掉 dev server。
- [ ] 更新根目录 `processing_visualization.html`：在 `seedData` 中新增/更新一条 ui 阶段任务记录（`status: 已完成`、progress 概述本次 UI 布局重构、problem/solution 记录已知缺口，如"平台公告无 API 默认空态、钉钉登录未配置"），并按需追加 `events` 条目；链接 `docs/ui-design/frontend-ui-design.md`。
- [ ] 提交：`test(web): align tests with localized ui refactor`，再单独提交 `docs: update processing visualization for ui refactor`。

**测试?**
- [ ] 三项命令全绿；浏览器核对无未修复偏差。

**Acceptance:** 全部测试通过、构建命令通过（如时间允许跑 `pnpm --filter @ai-hub/web build`）、视觉核对完成、`processing_visualization.html` 已更新。

---

## 收尾

- 全部任务完成后进行最终整体评审（最强模型，覆盖 `development..codex/frontend-ui-refactor` 全量 diff），按评审结果做一轮修复与 scoped re-review。
- 评审通过后使用 superpowers:finishing-a-development-branch 决定集成方式；删除本计划的 SDD workspace（`.superpowers/sdd/frontend-ui-refactor/`）。
