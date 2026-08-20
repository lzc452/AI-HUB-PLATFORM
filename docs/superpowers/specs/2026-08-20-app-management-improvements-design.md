# 应用管理改进（6 项）设计规格

日期：2026-08-20

## Context

应用管理域存在 3 个已定位根因的 bug（草稿删除确认弹窗连环弹出、校验未通过仍创建空草稿、部门选择后维护人为空），以及 3 个功能需求（交付类型多选、自定义分类/标签随审核流转、分类标签中文化与热门分类面板）。本规格覆盖全部 6 项，均已在探索阶段确认根因或现状，关键决策已由需求方逐项确认。

## 全局约束

- Kysely 迁移：新迁移文件编号沿用现有序列（当前最新 `0049_application_maintainers.ts`，功能 6 用 `0050_`、功能 5 用 `0051_`）；迁移必须幂等（`onConflict` / `if not exists`）；已应用迁移名称不可改动
- `exactOptionalPropertyTypes: true`：可选字段不可显式传 `undefined`（用条件展开 `...(x === undefined ? {} : { x })`）
- 前端：react-hook-form + zodResolver（向导表单），antd 组件，中文文案
- 测试：workspace 用 vitest（`*.test.tsx` / `*.test.ts` 与被测代码同目录）；服务层用内存仓库
- 修复前先写失败测试（TDD），修复后运行 `pnpm typecheck` + 相关 workspace 测试

---

## Bug 1：草稿删除确认后连续再弹 3 次确认弹窗

### 根因（已验证）

`apps/web/src/pages/applications/ApplicationsPage.tsx:87-90,127-185`：

1. `onOk` 删除分支（:174-178）只执行 `deleteApplication.mutate(...)` + `modal.destroy()`，**从不清理 `pendingAction`**（对比 `onCancel` :138-141 有清理）
2. 弹窗由 `useEffect` 驱动，依赖 `[list, pendingAction]`；`list` 来自 `useAdminApplicationList`（`apps/web/src/modules/application/useAdminApplicationList.ts:156-186`），每次渲染返回**新对象字面量** → 引用恒变 → effect 每次 re-render 重跑
3. 删除 mutation 状态翻转 + `invalidateCaches()` 触发列表/KPI refetch → 多次 re-render → 每次重弹一个 `Modal.confirm`

### 修复

`ApplicationsPage.tsx`：
- `onOk` 删除分支：`deleteApplication.mutate` 前先 `setPendingAction(null)`
- effect 依赖 `[list, pendingAction]` → `[pendingAction]`（`describeAction(action, row)` 只依赖 `pendingAction` 内的 action/row）

### 测试

`ApplicationsPage.test.tsx`（或现有测试文件）：mock 删除 mutation + `Modal.confirm`，点击删除确认后断言 confirm 只调用 1 次、成功后无残留弹窗。

---

## Bug 2：表单校验不通过仍创建草稿

### 根因（已验证）

向导提交路径校验正确（`FormWizard.tsx:77-115` 逐步骤 `form.trigger`，失败中止）。真正问题：**草稿在挂载时无条件创建** —— `ApplicationCreateWizardPage.tsx:82-112` 初始化 `useEffect` 在用户输入前就 `POST /internal/applications` 创建 `{name:"",summary:""}` 空草稿（拿 applicationId 供资产上传），StrictMode（`main.tsx:14`）下双建，用户放弃填写也留下空草稿 → 列表出现字段缺失的脏数据。

### 修复

- **删除挂载即创建 effect**（`ApplicationCreateWizardPage.tsx:82-112`）
- `FormWizard.tsx` 新增可选 prop：
  ```ts
  /** 当前步校验通过后、切换前调用；抛错则阻止前进。用于惰性创建草稿等副作用。 */
  onNextSuccess?: (values: FieldValues) => Promise<void>;
  ```
  `handleNext`：`validateStep` 通过后 `await onNextSuccess?.(form.getValues())`，抛错不 `setCurrent`
- 页面新增 `ensureDraft()`：无 `applicationId` 时 `createApplicationDraft()`（`publishing.client.ts:18-23`）并 setState；`onNextSuccess` 与 `onSaveDraft`（存草稿）入口调用；编辑模式（URL 带 applicationId）不创建
- 列表容错：`ApplicationAdminTable.tsx` 名称缺失时显示"未命名草稿"（防御既有脏数据）

### 测试

- 新增：向导挂载后不调用 `createApplicationDraft`；点击"下一步"校验通过后才创建、校验不通过不创建
- 更新 `ApplicationCreateWizardPage.submit-gate.test.tsx` 中依赖挂载创建的断言

---

## Bug 3：选中部门后维护人为空

### 根因（已验证）

- `GET /internal/identity/employees` 需 `identity.employee.read`（**不在员工基础角色**，仅 org admin/super_admin）→ 普通员工 `useEmployees()` 恒空 → 维护人下拉恒空
- `GET /internal/identity/departments/:departmentId/members` 只需 `identity.department.read`（**在员工基础角色**）→ 可用
- 向导（`ApplicationCreateWizardPage.tsx:70-72`）只用 employees 且不按部门过滤；`BasicInfoStep`（`steps.tsx:959-998`）部门与维护人控件无联动

### 修复

`apps/web/src/modules/publishing/steps.tsx` `BasicInfoStep`：
- `const departmentId = useWatch({ control, name: "departmentId" })`
- 维护人选项改用 `useDepartmentMembers(departmentId)`（`apps/web/src/modules/auth/useIdentity.ts:99-105`）：`enabled: departmentId !== undefined`；选项过滤 `status === "active"`
- 未选部门：选项为空，placeholder 显示"请先选择部门"
- 切换部门：清空 `maintainerEmployeeIds` 已选值（Controller 的 `field.onChange([])` 或表单 reset 该字段）
- 编辑回显：已存维护人不在当前部门成员内时保留已选值不回退

### 测试

`ApplicationCreateWizardPage` / `steps` 相关测试：选部门后维护人选项 = 该部门成员；切换部门清空已选。

---

## 功能 4：交付类型多选 + 数组落库

### 现状（已验证）

- 数据模型已是数组化：`application_deliveries`（每渠道一行，`UNIQUE(application_id, channel)`，迁移 0003）、草稿 `ApplicationDraft.deliveries: DeliveryDraftItem[]`（contracts application.ts:121-128,148）、catalog 返回 `deliveryChannels: readonly DeliveryChannel[]` —— **表结构无需改**
- 缺口：向导"交付配置"是 Radio 单选（`steps.tsx:1033-1050`）、`defaultDeliveriesForType` 只派生 1 渠道（`schema.ts:298-322`）、`DeliveryTargetsField.commitTargets` 硬编码写 `deliveries[0]`（`steps.tsx:730-747`）
- **`submitDraft` 不把 `draft.deliveries` 落库** `application_deliveries`（`application.service.ts:1736-1738` 只校验非空）→ 目录渠道只能靠独立交付页逐渠道 PUT（`PUT /deliveries/:channel`）

### 改动

**前端（向导）**
- `steps.tsx`"交付配置"：`Radio.Group` → `Checkbox.Group`（4 渠道多选，`aria-label="交付渠道"`）
- `schema.ts`：删除 `defaultDeliveriesForType` 类型派生逻辑，改为按勾选生成 `DeliveryDraftItem[]`：web → `entryUrl` 必填；desktop/mobile → `targets` 至少一项（复用 `DeliveryTargetsField`）；mini_program → 无额外必填
- `deliveryDraftItemSchema` 增加按 channel 的条件校验（zod superRefine / 分支 schema）
- `DeliveryTargetsField.commitTargets`：按当前渠道写入对应 item（不再写死 `[0]`）
- 预览步（`steps.tsx:1372-1394`）已按数组渲染，无需改

**后端**
- `submitDraft`（`application.service.ts:241-360`）事务内新增：循环 `draft.deliveries` 调 `repository.createDelivery`（upsert，`enabled=true`，`application.repository.ts:1155-1178`）+ `saveDeliveryTargets`（先删后插，:1212-1240）
- 发布门禁 `assertDeliveryChannelsComplete`（:832-884）：改为以草稿渠道集为准 —— 草稿所选渠道必须全部 `enabled=true`（替代按类型映射）
- 独立交付页 `ApplicationDeliveryPage.tsx` 保持逐渠道 PUT 现状（已是数组语义）

### 测试

- 后端：`submitDraft` 落库 deliveries 用例（内存仓库验证 `createDelivery` 调用 + enabled）
- 前端：多选派生用例（勾选 2 渠道 → deliveries 2 项、web 无 entryUrl 校验失败）

---

## 功能 5：自定义分类/标签 + 审核流转

### 现状（已验证）

- 创建表单分类/标签为固定下拉（`steps.tsx:999-1032`；分类必选 `schema.ts:125`、标签可多选）
- `submitDraft` 校验 `categoryId` 必填（`application.service.ts:1630-1632`）并落库 metadata + tag links（:290-294）
- 审核状态机：`draft → in_review → published`（驳回回滚），通过时 `registerToCatalog` 自动上架（:792-814）
- 审核工作台：`ApplicationReviewPage.tsx`（认领/释放/通过/驳回）

### 改动

**迁移 `0051_catalog_pending_items.ts`**
```sql
create table if not exists catalog_pending_items (
  item_id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(application_id) on delete cascade,
  kind text not null check (kind in ('category','tag')),
  name varchar(120) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, kind, name)
);
```

**contracts**：`ApplicationDraft` 增加 `customCategoryName?: string`、`customTagNames?: string[]`（`packages/contracts/src/application.ts`）

**前端创建表单**（`steps.tsx`）
- 分类：`Select` 改 `mode="tags"` `maxCount={1}`（可选现有分类或输入新名称）
- 标签：`Select` 改 `mode="tags"`（可选现有或输入新名称，标签本身可多选）
- 提交拆分：匹配现有 id 的值走 `categoryId`/`tagIds`；新名称走 `customCategoryName`/`customTagNames`
- schema：`categoryId` 或 `customCategoryName` 至少一个

**后端 `submitDraft`**
- 完整度校验（:1630-1632）：放宽为"`categoryId` 或 `customCategoryName` 至少一个"
- 自定义名处理（事务内）：按名称（trim，大小写不敏感）匹配现有 `catalog_categories`/`catalog_tags` → **重名自动复用现有 id**；全新名称 → 幂等插入 `catalog_pending_items`（`unique(application_id, kind, name)` onConflict doNothing）
- metadata/tagLinks 落库：**自定义分类场景（`customCategoryName` 存在时）跳过 metadata 分类写入**（`application_catalog_metadata.category_id` NOT NULL，未通过审核前不写占位），推迟到审核通过时由 `review()` 落库；已选现有 id 的标签立即 `replaceTagLinks`，自定义标签同样推迟到审核通过

**审核工作台**（`ApplicationReviewPage.tsx`）
- 新增"自定义分类/标签"卡片：查询该应用 pending items 列表，每项"删除"按钮
- 新端点：`DELETE /internal/applications/:applicationId/catalog-pending-items/:itemId`（`RequiresPermissions(APPLICATION_REVIEW)`）→ service 删除该行（校验归属应用）

**`review()` 流转**（`application.service.ts:703-829`）
- **approve**：事务内把未删除的 pending items 插入正式表 —— 重名复用现有；全新插入 `catalog_categories`（`category_id` 用 `gen_random_uuid()::text`，name 中文，enabled=true）/ `catalog_tags`（`tag_id` 同理 uuid）；应用关联：有通过的自定义分类 → 补写 `application_catalog_metadata.category_id`；通过的自定义标签 → 追加 tag links；`registerToCatalog` 默认 `categoryId="productivity"` 逻辑（:1543）仅在无自定义分类时生效
- **reject / 撤回（cancelPendingReview）/ 审核队列完成**：删除该应用全部 pending items（自动删除，已确认决策）

### 测试

- 后端：submitDraft 自定义名 → pending 表/重名复用用例；review approve → 插入正式表 + 关联；reject → pending 删除；删除端点权限用例
- 前端：创建表单自定义输入用例；审核卡片渲染/删除用例

---

## 功能 6：分类标签中文化 + 种子数据 + 热门分类面板

### 现状（已验证）

- 代码种子**已是中文**（demo `catalog.fixture.ts`：5 分类 + 8 标签；英文仅为主键 slug），无 migrations 种子
- "热门分类"概念不存在；市场右侧面板 `MarketplaceSidebar.tsx:20,42-62` 的"热门标签"是空占位
- `CategorySummaryDto` = `{ categoryId, name }`（`catalog.dto.ts:203-213`）

### 改动

**迁移 `0050_catalog_zh_hot_seed.ts`**（幂等）
1. 英文名 → 中文 UPDATE 兜底（按已知 slug/名称映射，如 `'Productivity' → '效率工具'` 等；对名称中含英文的旧数据生效）
2. **额外新增 10 分类 + 10 标签**（已确认决策：现有 5+8 保留，新增 10+10，总量 15 分类 + 18 标签）—— 中文名 + 英文 slug id，`onConflict(category_id/tag_id).doUpdateSet(name)` 幂等
   - 10 分类：智能助手、文档办公、图像识别、数据分析、客户服务、开发工具、教育培训、人力资源、财务税务、安全合规
   - 10 标签：智能助手、文档处理、OCR 识别、数据分析、流程自动化、移动办公、安全合规、报表分析、流程审批、知识库
3. `alter table catalog_categories add column if not exists is_hot boolean not null default false`
4. **新 10 分类中 5 条标热门**（`is_hot=true`）：智能助手、文档办公、数据分析、图像识别、财务税务

**catalog 接口**：`CategorySummaryDto` 增加 `isHot: boolean`；repository `listCategories`（`catalog.repository.ts` 相应查询）返回 `is_hot`；controller `GET /internal/catalog/categories` 输出

**前端右侧面板**（`MarketplaceSidebar.tsx`）："热门标签"空占位替换为**"热门分类"**卡片 —— 拉取 `GET /internal/catalog/categories` 过滤 `isHot` 的 5 条，点击设置市场分类过滤（复用 `MarketplacePage` 的 categoryId state，经 prop/回调接线）

**demo fixtures 同步**（`packages/database/src/demo-data/fixtures/catalog.fixture.ts`）：`CATEGORY_DEFS`/`TAG_DEFS` 加入新 10+10（id 与迁移一致，upsert 幂等不冲突）

### 测试

- 迁移 smoke（类型检查即可，迁移本身在 CI 容器跑）
- catalog `categories` 接口返回 `isHot`（服务层/集成测试）
- 侧边栏：热门分类渲染 5 条 + 点击触发过滤

---

## 实施顺序

1. Bug 1（最小）→ 2. Bug 2 → 3. Bug 3 → 4. 功能 4 → 5. 功能 6（迁移先行）→ 6. 功能 5（最大最后）

## 验收标准

- `pnpm typecheck` 全绿；`@ai-hub/server`、`@ai-hub/web` 相关测试全绿
- 手动验证：删除草稿确认仅弹一次；未点下一步不产生草稿；选部门后维护人显示该部门成员；向导多选交付并提交后目录可见多渠道；创建自定义分类/标签 → 审核工作台可见可删 → 通过后出现在正式分类/标签；市场右侧显示 5 条热门分类可点击过滤
