# 应用管理详情工作台全栈还原 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有四条路由与权限语义的前提下，将应用详情、版本管理、审核工作台和交付配置完整还原为四张 `1672×941` 设计图，并补齐真实可用的资料、比较、审核和交付数据流。

**Architecture:** 以 `ApplicationWorkspace` 聚合接口作为四页统一读模型，复用现有 Application、Catalog、Creator、Identity、审计和制品校验数据；新增资料/素材、版本快照、校验项和渠道配置持久化。前端保留 pages 编排，业务请求放在 `modules/application`，跨页视觉模式收敛到 `components/common`，缺失视觉资源使用独立 React SVG/CSS 重绘。

**Tech Stack:** React 19、React Router 6、TanStack Query 5、Ant Design 6、TailwindCSS 4、NestJS、Kysely、PostgreSQL、Vitest。

## Global Constraints

- 用户可见文案、Markdown 和代码注释使用简体中文；标识符、路由、表列、事件类型和技术专名保持英文。
- 设计图是布局、尺寸、颜色和图标真相源；现有权限与状态机是业务真相源。
- 原始验收视口固定为 `1672×941`，核心布局误差不超过 `2px`，图标尺寸与对齐误差不超过 `1px`。
- 不修改全局 `theme.ts`；页面级视觉使用公共组件和作用域样式，避免影响无关路由。
- 资源缺失时使用 React SVG/CSS 重绘，禁止裁切设计图或使用 emoji/Unicode 替代图标。

---

### Task 1: 应用工作台契约与持久化

**Files:**
- Modify: `packages/contracts/src/application.ts`
- Create: `packages/database/src/migrations/0017_application_workspace.ts`
- Modify: `packages/database/src/schema.ts`
- Test: `packages/database/src/migrations/0017_application_workspace.test.ts`

**Interfaces:**
- Produces: `ApplicationWorkspace`, `ApplicationProfile`, `ApplicationAsset`, `ApplicationVersionSummary`, `ApplicationValidationCheck`, `DeliveryConfiguration`。
- 新表：`application_profiles`、`application_assets`、`application_version_snapshots`、`application_validation_checks`；扩展 `application_deliveries.configuration`、`updated_by_employee_id`。

- [ ] **Step 1: 写迁移 RED 测试**：迁移后可插入资料、排序素材、版本快照、校验项和四类渠道配置，并验证唯一约束、外键和级联删除。
- [ ] **Step 2: 运行测试确认因迁移缺失而失败**：`pnpm --filter @ai-hub/database test -- 0017_application_workspace.test.ts`。
- [ ] **Step 3: 实现最小迁移、schema 和 contracts**：资料字段包含 `businessScenario`、`problemStatement`、`features`、`targetUserDescription`、`iconVariant`；素材包含 `kind`、`name`、`mimeType`、`sizeBytes`、`storageKey`、`sortOrder`；版本快照保存不可变 JSON；渠道配置使用判别联合类型。
- [ ] **Step 4: 运行数据库目标测试和 typecheck**。

### Task 2: 后端工作台聚合与写操作

**Files:**
- Modify: `packages/server/src/application/{application.types.ts,application.repository.ts,application.service.ts,application.dto.ts,application.controller.ts}`
- Test: `packages/server/src/application/application.service.test.ts`
- Test: `apps/api/test/application.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /internal/applications/:applicationId/workspace`。
- Produces: `PUT /internal/applications/:applicationId/profile`、`POST/DELETE .../assets`、`PUT .../ownership`。
- Produces: `GET .../versions/compare?from=&to=`、`GET .../audit-events`。
- Produces: `POST .../versions/:applicationVersionId/{claim-review,release-review,review,reassign-review}`。
- Produces: `PUT .../deliveries/:channel`、`POST .../deliveries/validate`、`POST .../deliveries/submit-review`。

- [ ] **Step 1: 写 service RED 测试**：聚合结果必须同时返回应用、Catalog 元数据、员工/部门显示名、资料/素材、版本状态、审核队列、校验项、交付配置和审计时间线。
- [ ] **Step 2: 运行目标测试，确认因方法和 repository 端口缺失而失败**。
- [ ] **Step 3: 实现聚合读模型**：通过一次 repository 聚合查询和有限并行查询避免逐行 N+1；版本状态由当前版本、审核队列、评审与发布审计事件推导。
- [ ] **Step 4: 写写操作 RED 测试**：仅 owner/maintainer 可更新资料和交付；仅 reviewer 可认领、转交和评审；自审继续禁止；提交交付审核前四渠道必须启用且校验通过。
- [ ] **Step 5: 实现资料、资产元数据、所有权、审核、交付 upsert/validate/submit，所有变更写入 audit 与 Outbox**。
- [ ] **Step 6: 写并运行 API e2e 测试，覆盖 200、400、403、404 与并发冲突**。

### Task 3: 前端数据层与共享视觉骨架

**Files:**
- Modify: `apps/web/src/modules/application/{application.client.ts,useApplication.ts}`
- Modify: `apps/web/src/components/common/ApplicationAdminPage.tsx`
- Create: `apps/web/src/components/common/application-workspace/*`
- Test: `apps/web/src/pages/applications/ApplicationWorkspace.test.tsx`

**Interfaces:**
- Produces hooks: `useApplicationWorkspace`、`useUpdateApplicationProfile`、`useCompareApplicationVersions`、`useReviewActions`、`useDeliveryActions`。
- Produces components: `ApplicationIdentityHeader`、`ApplicationSectionTabs`、`WorkspacePanel`、`OcrApplicationIcon`、`ApplicationPreviewThumbnail`、`DeterministicQrCode`、状态/人员/时间线组件。

- [ ] **Step 1: 写 hook 和公共壳层 RED 测试**：四条路由共享同一应用身份信息，Tabs 使用真实 URL，高权限操作按 actor 权限和业务状态启停。
- [ ] **Step 2: 运行测试确认因新 hooks/组件缺失而失败**。
- [ ] **Step 3: 实现客户端契约、缓存键和 mutation 失效范围**：成功后仅失效当前 application workspace、版本、审核或交付域；错误统一走 `MessageError`/message。
- [ ] **Step 4: 实现桌面精确壳层与窄屏降级**：桌面复用现有 Header/Navigation；`<1200px` 保留现有 Drawer；内容面板允许纵向滚动，不固定缩放设计图。
- [ ] **Step 5: 运行目标测试、typecheck 和 lint**。

### Task 4: 基本信息与版本管理

**Files:**
- Modify: `apps/web/src/pages/applications/ApplicationDetailsPage.tsx`
- Modify: `apps/web/src/pages/applications/ApplicationVersionsPage.tsx`
- Create: `apps/web/src/pages/applications/details/*`
- Create: `apps/web/src/pages/applications/versions/*`
- Test: `apps/web/src/pages/applications/ApplicationWorkspace.test.tsx`

**Interfaces:**
- Consumes: `ApplicationWorkspace` 和 Task 3 公共组件/hooks。
- Produces: 基本信息编辑、下架、归档、责任人转移；时间轴/列表视图；任意两个版本比较。

- [ ] **Step 1: 写基本信息 RED 测试**：验证资料区、业务场景、解决问题、关键特性、截图、附件、应用信息、受众、团队、发布状态和权限动作。
- [ ] **Step 2: 实现基本信息页并运行目标测试转绿**。
- [ ] **Step 3: 写版本 RED 测试**：验证状态计数、时间轴/列表切换、搜索、A/B 选择、比较结果、空态和错误态。
- [ ] **Step 4: 实现版本页并运行目标测试转绿**。

### Task 5: 审核工作台与交付配置

**Files:**
- Modify: `apps/web/src/pages/applications/ApplicationReviewPage.tsx`
- Modify: `apps/web/src/pages/applications/ApplicationDeliveryPage.tsx`
- Create: `apps/web/src/pages/applications/review/*`
- Create: `apps/web/src/pages/applications/delivery/*`
- Test: `apps/web/src/pages/applications/ApplicationWorkspace.test.tsx`

**Interfaces:**
- Consumes: 审核队列/校验项/版本快照/交付配置 API。
- Produces: 认领、释放、转交、通过、驳回、保存备注；四渠道编辑、保存草稿、校验、提交审核。

- [ ] **Step 1: 写审核 RED 测试**：未认领不能评审、自审禁用、驳回原因必填、SLA 实时展示、成功后刷新状态与意见记录。
- [ ] **Step 2: 实现审核页并运行目标测试转绿**。
- [ ] **Step 3: 写交付 RED 测试**：各渠道表单映射到判别联合配置，自动校验失败阻止提交，二维码从 URL 稳定生成，保存草稿不改变应用状态。
- [ ] **Step 4: 实现交付页并运行目标测试转绿**。

### Task 6: 视觉收敛与完整验证

**Files:**
- Modify: `apps/web/src/styles.css`（仅 `.application-workspace-*` 作用域）
- Modify: `packages/database/src/demo-data/fixtures/application.fixture.ts`
- Modify: `processing_visualization.html`

- [ ] **Step 1: 为 OCR 演示应用补齐 5 个版本、资料、素材元数据、审核队列、校验项、四渠道配置和审计事件 fixture**。
- [ ] **Step 2: 在 `1672×941` 视口逐页采集 RED/GREEN 截图，维护偏差矩阵，按骨架、间距、字体、边框、颜色、图标顺序收敛**。
- [ ] **Step 3: 验证 loading、empty、error、403、hover、focus、selected、disabled 与 reduced-motion**。
- [ ] **Step 4: 运行 `@ai-hub/database`、`@ai-hub/server`、`@ai-hub/api`、`@ai-hub/web` 的目标测试，再运行 Web `test/typecheck/lint/build` 和受影响 package 验证**。
- [ ] **Step 5: 更新 `processing_visualization.html` 的 ui/dev/test 任务与事件，记录基线测试中既有失败和最终结果**。

