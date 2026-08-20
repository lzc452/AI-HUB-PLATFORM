# 应用管理改进 6 项实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复应用管理 3 个已定位根因的 bug（删除弹窗连弹、校验未过仍建草稿、维护人不随部门联动），并实现交付类型多选落库、自定义分类/标签审核流转、分类标签中文化与热门分类面板。

**Architecture:** 前端 React 向导（react-hook-form + zod）+ 后端 NestJS 模块化单体 + Kysely。Bug 修复集中在 `apps/web`；功能 4 涉及 `submitDraft` 落库链路（后端 service/repository）；功能 5 新增待审表 + 审核工作台卡片；功能 6 为幂等迁移 + catalog 接口扩展 + 市场右侧面板。

**Tech Stack:** TypeScript、React 18 + antd + react-hook-form + zod + TanStack Query、NestJS、Kysely + PostgreSQL、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-20-app-management-improvements-design.md`

## Global Constraints

- 新迁移编号：功能 6 = `0050_catalog_zh_hot_seed.ts`，功能 5 = `0051_catalog_pending_items.ts`；迁移必须幂等（`onConflict` / `add column if not exists`）；已应用迁移名称不可改动
- `exactOptionalPropertyTypes: true`：可选字段不可显式传 `undefined`（用 `...(x === undefined ? {} : { x })`）
- 中文文案；antd 组件；react-hook-form（向导）与 antd Form（其他表单）并存
- 测试：vitest，`*.test.ts(x)` 与被测代码同目录；TDD —— 先写失败测试再实现
- 提交粒度：每任务独立 commit；消息用 conventional commits（`fix:`/`feat:`/`migration:`）
- 每次修改后跑 `pnpm typecheck`；相关 workspace 测试 `pnpm --filter @ai-hub/web test` / `pnpm --filter @ai-hub/server test`

---

### Task 1: Bug 1 — 删除确认弹窗修复

**Files:**
- Modify: `apps/web/src/pages/applications/ApplicationsPage.tsx`（effect 区 :127-185）
- Test: `apps/web/src/pages/applications/ApplicationsPage.test.tsx`（新建）

**Interfaces:**
- Consumes: `useAdminApplicationList()`（`apps/web/src/modules/application/useAdminApplicationList.ts`）、`useDeleteApplication()`（`useApplication.ts:190-200`）、`Modal.confirm`
- Produces: 无（修复）

- [ ] **Step 1: 写失败测试**

先读 `ApplicationsPage.tsx` 顶部确认组件导出名与 props。新建测试文件，mock 数据 hooks 与 `Modal.confirm`：

```tsx
// apps/web/src/pages/applications/ApplicationsPage.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Modal } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  list: { data: [], error: null, isPending: false, isFetching: false },
  deleteMutate: vi.fn(),
}));

vi.mock("../../modules/application/useAdminApplicationList", () => ({
  useAdminApplicationList: () => hoisted.list,
}));
vi.mock("../../modules/application/useApplication", () => ({
  useDeleteApplication: () => ({
    mutate: hoisted.deleteMutate,
    isPending: false,
  }),
}));

import { ApplicationsPage } from "./ApplicationsPage";

describe("ApplicationsPage 删除草稿", () => {
  beforeEach(() => {
    hoisted.deleteMutate.mockReset();
  });

  it("确认删除后仅弹出一次确认框并触发删除", async () => {
    const confirmSpy = vi
      .spyOn(Modal, "confirm")
      .mockReturnValue({ destroy: vi.fn() } as never);
    hoisted.list.data = [
      {
        applicationId: "app-1",
        name: "测试草稿",
        status: "draft",
        categoryId: "productivity",
        updatedAt: "2026-08-20T00:00:00.000Z",
        ownerEmployeeId: "E001",
        ownerName: "张三",
      },
    ];
    render(<ApplicationsPage />);

    fireEvent.click(screen.getByRole("button", { name: /删\s*除/ }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // 触发 onOk（删除分支）：mutation 状态翻转会引发重渲染，断言不再新增弹窗
    const options = confirmSpy.mock.calls[0]![0];
    await options.onOk!();
    await waitFor(() => expect(hoisted.deleteMutate).toHaveBeenCalledWith("app-1"));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
```

> 注：行对象的必填字段以 `ApplicationsPage.tsx` 中 `AdminApplicationRow` 实际类型为准补齐（mock 值只影响渲染路径）。

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/pages/applications/ApplicationsPage.test.tsx`
Expected: FAIL —— `expect(confirmSpy).toHaveBeenCalledTimes(1)` 处实际 >1（连弹 bug 复现）。

- [ ] **Step 3: 实现修复**

`ApplicationsPage.tsx`：
1. `onOk` 删除分支（约 :174-178）在 `deleteApplication.mutate(...)` 前加 `setPendingAction(null);`
2. effect 依赖 `[list, pendingAction]` → `[pendingAction]`

- [ ] **Step 4: 运行测试确认通过**

Run: 同上。Expected: PASS。
再跑 `corepack pnpm --filter @ai-hub/web exec vitest run src/pages/applications/` 全目录（确认无回归）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/applications/ApplicationsPage.tsx apps/web/src/pages/applications/ApplicationsPage.test.tsx
git commit -m "fix(web): 删除草稿确认后清理 pendingAction 并收窄 effect 依赖，消除连环弹窗"
```

---

### Task 2: Bug 2 — 草稿惰性创建

**Files:**
- Modify: `apps/web/src/shared/forms/FormWizard.tsx`（props :30-45、handleNext :82-86）
- Modify: `apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx`（挂载 effect :82-112、handleSubmit 区 :141-157）
- Modify: `apps/web/src/pages/applications/ApplicationAdminTable.tsx`（名称渲染）
- Test: `apps/web/src/pages/creator/ApplicationCreateWizardPage.submit-gate.test.tsx`（更新）+ 新增用例

**Interfaces:**
- Consumes: `createApplicationDraft(): Promise<{ applicationId: string }>`（`apps/web/src/modules/publishing/publishing.client.ts:18-23`）
- Produces: `FormWizard` 新增可选 prop `onNextSuccess?: (values: FieldValues) => Promise<void>`；向导页内部 `ensureDraft(): Promise<string | null>`

- [ ] **Step 1: 写失败测试**

在 `ApplicationCreateWizardPage.submit-gate.test.tsx` 中新增用例（先读现有 mock 结构对齐）：

```tsx
it("挂载时不创建草稿；首次下一步校验通过后才创建", async () => {
  render(<App />);
  expect(createApplicationDraftMock).not.toHaveBeenCalled();

  // 第一步字段填写完整后点"下一步"（必填字段以现有 submit-gate 测试中
  // 成功提交所填的字段集合为准，逐项填齐：名称、简介、部门、维护人、分类等）
  fireEvent.change(screen.getByLabelText(/应用名称/), { target: { value: "测试应用" } });
  for (const label of [/应用简介/, /归属部门/, /维护人/, /选择分类/]) {
    const field = screen.queryByLabelText(label);
    if (field) fireEvent.change(field, { target: { value: "值" } });
  }
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  await waitFor(() => expect(createApplicationDraftMock).toHaveBeenCalledTimes(1));
});

it("校验不通过时点下一步不创建草稿", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(createApplicationDraftMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/pages/creator/ApplicationCreateWizardPage.submit-gate.test.tsx`
Expected: FAIL（当前挂载即创建，第一个用例 `not.toHaveBeenCalled` 失败）。

- [ ] **Step 3: 实现**

1. `FormWizard.tsx`：props 接口加 `onNextSuccess?: (values: FieldValues) => Promise<void>`；`handleNext` 改为：

```tsx
const handleNext = async () => {
  if (await validateStep(current)) {
    try {
      await onNextSuccess?.(form.getValues());
    } catch {
      return; // 副作用失败（如草稿创建失败）不前进
    }
    setCurrent((index) => Math.min(index + 1, steps.length - 1));
  }
};
```

2. `ApplicationCreateWizardPage.tsx`：
   - 删除挂载即创建 `useEffect`（:82-112）
   - 新增 `const ensureDraft = async (): Promise<string | null> => { if (applicationId) return applicationId; const created = await createApplicationDraft(); setApplicationId(created.applicationId); return created.applicationId; }`（`applicationId` 为现有 state，编辑模式从 URL 初始化）
   - `<FormWizard ... onNextSuccess={async () => { await ensureDraft(); }} onSaveDraft={async (values) => { const id = await ensureDraft(); if (id) await saveApplicationDraft(id, values); }} />`
3. `ApplicationAdminTable.tsx`：名称列为空时显示 `未命名草稿`（`row.name?.trim() || "未命名草稿"`，以实际列渲染代码为准）

- [ ] **Step 4: 运行测试确认通过**

Run: submit-gate 测试 + `corepack pnpm --filter @ai-hub/web exec vitest run src/pages/creator/` 全目录。
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/forms/FormWizard.tsx apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx apps/web/src/pages/applications/ApplicationAdminTable.tsx apps/web/src/pages/creator/ApplicationCreateWizardPage.submit-gate.test.tsx
git commit -m "fix(web): 草稿改为首次有效下一步/存草稿时惰性创建，校验不通过不再产生空草稿"
```

---

### Task 3: Bug 3 — 维护人按所选部门联动

**Files:**
- Modify: `apps/web/src/modules/publishing/steps.tsx`（`BasicInfoStep` :928-1099）
- Test: `apps/web/src/modules/publishing/steps.test.tsx`

**Interfaces:**
- Consumes: `useDepartmentMembers(departmentId?: string)`（`apps/web/src/modules/auth/useIdentity.ts:99-105`）、`useWatch`（react-hook-form）
- Produces: `BasicInfoStep` 维护人选项 = 所选部门 active 成员

- [ ] **Step 1: 写失败测试**

在 `steps.test.tsx` 现有 harness 中新增（先读现有渲染方式对齐）：

```tsx
it("选中部门后维护人选项仅含该部门成员", async () => {
  // mock useDepartmentMembers 返回 [{ employeeId: "E001", displayName: "张三", status: "active" }]
  render(<BasicInfoStep ... />);
  fireEvent.change(screen.getByLabelText(/归属部门/), { target: { value: "dept-1" } });
  await waitFor(() => {
    expect(screen.getByLabelText(/维护人/)).toHaveTextContent("张三");
  });
});

it("切换部门时清空已选维护人", async () => {
  // 先选 dept-1 并勾选张三，再切换到 dept-2
  // 断言维护人已选值清空
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/modules/publishing/steps.test.tsx`
Expected: FAIL（当前无联动）。

- [ ] **Step 3: 实现**

`steps.tsx` `BasicInfoStep`：
1. `const departmentId = useWatch({ control, name: "departmentId" });`
2. 维护人选项改为：

```tsx
const membersQuery = useDepartmentMembers(departmentId);
const maintainerOptions = (membersQuery.data ?? [])
  .filter((e) => e.status === "active")
  .map((e) => ({ value: e.employeeId, label: e.displayName }));
```

3. 维护人 `Select`（:989-998）：`options={maintainerOptions}`；未选部门时 `placeholder="请先选择部门"`、`disabled={!departmentId}`（`field.onChange([])` 由下面第 4 步负责）
4. 部门 `Controller` 的 `onChange` 包装：`onChange={(v) => { field.onChange(v); if (v !== previousDepartmentId) maintainersField.onChange([]); }}` —— 用 `useWatch` 比较或直接在此处重置 `maintainerEmployeeIds`（实现时以表单结构为准，保持"切换部门清空已选"语义）
5. 编辑回显：不清空（仅切换时清空）

- [ ] **Step 4: 运行测试确认通过**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/modules/publishing/`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/publishing/steps.tsx apps/web/src/modules/publishing/steps.test.tsx
git commit -m "fix(web): 创建应用维护人随所选部门联动（部门成员接口），切换部门清空已选"
```

---

### Task 4: 功能 6a — 迁移 0050（中文化兜底 + 种子 + is_hot）

**Files:**
- Create: `packages/database/src/migrations/0050_catalog_zh_hot_seed.ts`
- Modify: `packages/database/src/demo-data/fixtures/catalog.fixture.ts`（`CATEGORY_DEFS`/`TAG_DEFS`）
- Modify: `packages/database/src/demo-data/ids.ts`（新 id 常量）

**Interfaces:**
- Produces: `catalog_categories` 新增 `is_hot boolean not null default false`；库中存在 15 分类 + 18 标签（原 5+8 保留，新增 10+10），其中新 10 分类中 5 条 `is_hot=true`；英文名已转中文

- [ ] **Step 1: 写迁移**

```ts
// packages/database/src/migrations/0050_catalog_zh_hot_seed.ts
import { sql, type Kysely } from "kysely";

/** 英文旧名 → 中文兜底映射（幂等 UPDATE，仅命中英文名行）。 */
const ZH_RENAME: Readonly<Record<string, string>> = {
  Productivity: "效率工具",
  "AI": "AI 智能",
  Reporting: "数据报表",
  Collaboration: "协同办公",
  Automation: "流程自动化",
};

/** 新增 10 分类（前 5 条为热门）。 */
const CATEGORIES: ReadonlyArray<{ id: string; name: string; hot: boolean }> = [
  { id: "smart_assistant", name: "智能助手", hot: true },
  { id: "document_office", name: "文档办公", hot: true },
  { id: "data_analysis", name: "数据分析", hot: true },
  { id: "image_recognition", name: "图像识别", hot: true },
  { id: "finance_tax", name: "财务税务", hot: true },
  { id: "customer_service", name: "客户服务", hot: false },
  { id: "dev_tools", name: "开发工具", hot: false },
  { id: "education_training", name: "教育培训", hot: false },
  { id: "hr_management", name: "人力资源", hot: false },
  { id: "security_compliance", name: "安全合规", hot: false },
];

/** 新增 10 标签。 */
const TAGS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "smart_assistant", name: "智能助手" },
  { id: "document_processing", name: "文档处理" },
  { id: "ocr", name: "OCR 识别" },
  { id: "data_analytics", name: "数据分析" },
  { id: "process_automation", name: "流程自动化" },
  { id: "mobile_office", name: "移动办公" },
  { id: "security_compliance", name: "安全合规" },
  { id: "report_analysis", name: "报表分析" },
  { id: "approval_flow", name: "流程审批" },
  { id: "knowledge_base", name: "知识库" },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  // 英文名 → 中文（兜底）
  for (const [english, chinese] of Object.entries(ZH_RENAME)) {
    await sql`update catalog_categories set name = ${chinese} where name = ${english}`.execute(db);
  }
  // 热门列
  await sql`alter table catalog_categories add column if not exists is_hot boolean not null default false`.execute(db);
  // 新增分类（幂等）
  for (const category of CATEGORIES) {
    await sql`
      insert into catalog_categories (category_id, name, sort_order, enabled, is_hot)
      values (${category.id}, ${category.name}, 10, true, ${category.hot})
      on conflict (category_id) do update set name = excluded.name, is_hot = excluded.is_hot
    `.execute(db);
  }
  // 新增标签（幂等）
  for (const tag of TAGS) {
    await sql`
      insert into catalog_tags (tag_id, name, enabled)
      values (${tag.id}, ${tag.name}, true)
      on conflict (tag_id) do update set name = excluded.name
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table catalog_categories drop column if exists is_hot`.execute(db);
  for (const category of CATEGORIES) {
    await sql`delete from catalog_categories where category_id = ${category.id}`.execute(db);
  }
  for (const tag of TAGS) {
    await sql`delete from catalog_tags where tag_id = ${tag.id}`.execute(db);
  }
}
```

> 注：`catalog_categories` 若已有 `sort_order` 使用习惯（现有种子 sort_order 未知），插入值以现有最大 sort_order + 1 为准，实现时先查现有值。

- [ ] **Step 2: 同步 demo fixtures**

`catalog.fixture.ts` 的 `CATEGORY_DEFS`/`TAG_DEFS` 追加上述 10+10（id 与 name 与迁移一致）；`ids.ts` 的 `CATEGORIES`/`TAGS` 常量补充新 id。检查 `catalog_categories` 的 `sort_order` 字段在 fixture 中如何赋值并保持一致。

- [ ] **Step 3: 类型检查 + 迁移冒烟**

Run: `corepack pnpm --filter @ai-hub/database typecheck`
Expected: PASS。
（迁移实际执行在 CI/容器中验证：`docker compose -f compose.yaml -f compose.test.yaml run --rm test` 或本地 `pnpm migrate`。）

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/migrations/0050_catalog_zh_hot_seed.ts packages/database/src/demo-data/
git commit -m "migration: 分类标签中文化兜底 + 新增 10 分类 10 标签 + is_hot 热门标记"
```

---

### Task 5: 功能 6b — categories 接口 isHot + 市场右侧热门分类面板

**Files:**
- Modify: `packages/server/src/catalog/catalog.repository.ts`（`listCategories` :550-561）
- Modify: `packages/server/src/catalog/catalog.dto.ts`（`CategorySummaryDto` :203-213）
- Modify: `apps/web/src/pages/marketplace/MarketplaceSidebar.tsx`（热门标签占位 → 热门分类）
- Modify: `apps/web/src/pages/marketplace/MarketplacePage.tsx`（接线）
- Test: `packages/server/src/catalog/catalog.service.test.ts`、`apps/web/src/pages/marketplace/MarketplaceSidebar.test.tsx`

**Interfaces:**
- Produces: `CategorySummaryDto` 增加 `isHot: boolean`；`listCategories()` 返回 `{ categoryId, name, isHot }`；`MarketplaceSidebar` 新增 prop `onSelectCategory: (categoryId: string) => void`

- [ ] **Step 1: 写失败测试**

`catalog.service.test.ts` 新增（按现有 harness）：

```ts
it("listCategories 返回 isHot 标记", async () => {
  // 内存仓库返回 [{ categoryId: "smart_assistant", name: "智能助手", isHot: true }]
  const result = await service.listCategories();
  expect(result[0]).toMatchObject({ categoryId: "smart_assistant", isHot: true });
});
```

`MarketplaceSidebar.test.tsx` 新增：mock categories 返回含 5 条 isHot → 断言渲染"热门分类"标题与 5 条名称；点击触发 `onSelectCategory`。

- [ ] **Step 2: 运行测试确认失败**

Run: 两个测试文件。Expected: FAIL。

- [ ] **Step 3: 实现**

1. `catalog.repository.ts` `listCategories`：select 增加 `"is_hot"`，返回 `{ categoryId, name, isHot: row.is_hot }`
2. `catalog.dto.ts` `CategorySummaryDto` 增加：

```ts
@ApiProperty({ type: Boolean, description: "是否热门分类", example: true })
isHot!: boolean;
```

3. `MarketplaceSidebar.tsx`：用 `useCatalogCategories()`（`apps/web/src/modules/marketplace/useCatalog.ts` 中现有 hook，`ApplicationCreateWizardPage.tsx:47-50` 同源使用 `listCategories`）过滤 `isHot` 渲染"热门分类"卡片（5 条，可点击）；替换 `hotTags` 空占位（保留"最近更新"占位不动）。若 useCatalog.ts 无对应 hook，新建 `useCatalogCategories()`（queryKey `["catalog","categories"]`，复用 `listCategories` client 函数）
4. `MarketplacePage.tsx`：传 `onSelectCategory={(id) => setCategoryId(id)}`（复用现有 categoryId state；先读页面确认 state 名与侧边栏渲染位置）

- [ ] **Step 4: 运行测试确认通过**

Run: `corepack pnpm --filter @ai-hub/server exec vitest run src/catalog/catalog.service.test.ts` + `corepack pnpm --filter @ai-hub/web exec vitest run src/pages/marketplace/MarketplaceSidebar.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/catalog/ apps/web/src/pages/marketplace/MarketplaceSidebar.tsx apps/web/src/pages/marketplace/MarketplacePage.tsx
git commit -m "feat: 分类接口返回 isHot，市场右侧面板展示热门分类并可点击过滤"
```

---

### Task 6: 功能 4 — 交付类型多选 + submitDraft 落库 + 发布门禁

**Files:**
- Modify: `apps/web/src/modules/publishing/steps.tsx`（交付配置 :1033-1050、`DeliveryTargetsField.commitTargets` :718-747）
- Modify: `apps/web/src/modules/publishing/schema.ts`（`deliveryDraftItemSchema` :104-111、`defaultDeliveriesForType` :298-322）
- Modify: `packages/server/src/application/application.service.ts`（`submitDraft` 事务 :285-361、`assertDeliveryChannelsComplete` :832-884）
- Test: `apps/web/src/modules/publishing/schema.test.tsx`、`packages/server/src/application/application.service.test.ts`

**Interfaces:**
- Consumes: `DeliveryDraftItem`（contracts application.ts:121-128：`{ channel, entryUrl: string|null, minClientVersion: string|null, enabled, assetIds, targets? }`）、`createDelivery(input: Omit<DeliveryRecord,"deliveryId">)`（repository :1155）、`saveDeliveryTargets(deliveryId, targets)`（repository :1212）
- Produces: `submitDraft` 落库草稿 deliveries；`assertDeliveryChannelsComplete` 语义改为"草稿所选渠道全部 enabled"

- [ ] **Step 1: 写失败测试**

`schema.test.tsx` 新增：

```tsx
it("多选交付渠道时逐渠道校验必填：web 缺 entryUrl 失败、desktop 缺 targets 失败", () => {
  // deliveries = [{ channel: "web", entryUrl: null, ... }, { channel: "desktop", ... }]
  // 断言 schema 校验返回问题项
});
```

`application.service.test.ts` 新增（内存仓库补 `createDelivery`/`saveDeliveryTargets` 记录）：

```ts
it("submitDraft 将草稿 deliveries 落库为 enabled 交付渠道", async () => {
  // 草稿 deliveries = [web(entryUrl), desktop(targets)] → 提交后仓库记录 2 条渠道且 enabled=true
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: 两个文件。Expected: FAIL。

- [ ] **Step 3: 实现**

1. `steps.tsx`：交付配置 `Radio.Group` → `Checkbox.Group`（`aria-label="交付渠道"`，4 选项）；`DeliveryTargetsField.commitTargets` 改为写入当前渠道对应 item（不再 `deliveries[0]`）
2. `schema.ts`：
   - 删除 `defaultDeliveriesForType` 的单渠道派生；新增 `deriveDeliveriesFromChannels(selectedChannels: DeliveryChannel[]): DeliveryDraftItem[]`（web→entryUrl 空字符串待填、desktop/mobile→空 targets 待填、mini_program→`{ channel, entryUrl: null, ... }`）
   - `deliveryDraftItemSchema` 按 channel 条件校验：`web` 时 `entryUrl` 必填非空；`desktop`/`mobile` 时 `targets` 数组长度 ≥1；`mini_program` 无额外要求（用 `z.discriminatedUnion` 或 `superRefine`，以现有 schema 风格为准）
   - 表单层 `deliveries` 仍 `min(1)`
3. `application.service.ts` `submitDraft` 事务内（在 `setMaintainers` 后、`createVersion` 前）新增私有方法调用：

```ts
await this.persistDraftDeliveries(repository, applicationId, sanitizedDraft.deliveries);
```

```ts
private async persistDraftDeliveries(
  repository: ApplicationRepository,
  applicationId: string,
  deliveries: readonly DeliveryDraftItem[],
): Promise<void> {
  for (const item of deliveries) {
    const delivery = await repository.createDelivery({
      applicationId,
      channel: item.channel,
      entryUrl: item.entryUrl ?? "",
      minClientVersion: item.minClientVersion,
      enabled: true,
    });
    if (item.targets && item.targets.length > 0) {
      await repository.saveDeliveryTargets(delivery.deliveryId, item.targets);
    }
  }
}
```

4. `assertDeliveryChannelsComplete`（:832-884）：改为读取该应用草稿（`repository.findDraft(applicationId)`）—— 草稿存在时 `requiredChannels = draft.deliveries.map(d => d.channel)`；草稿缺失（遗留 publish 路径）保留现有 `requiredChannelsByType` 回退；mini_program 的 targets/二维码资产检查保留

- [ ] **Step 4: 运行测试确认通过**

Run: 两个测试文件 + `corepack pnpm --filter @ai-hub/server exec vitest run src/application/` + `corepack pnpm --filter @ai-hub/web exec vitest run src/modules/publishing/`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/publishing/steps.tsx apps/web/src/modules/publishing/schema.ts packages/server/src/application/application.service.ts
git commit -m "feat: 交付类型多选（逐渠道必填校验）+ submitDraft 落库交付渠道 + 发布门禁以草稿渠道为准"
```

---

### Task 7: 功能 5a — 迁移 0051 pending 表

**Files:**
- Create: `packages/database/src/migrations/0051_catalog_pending_items.ts`

**Interfaces:**
- Produces: 表 `catalog_pending_items(item_id uuid pk default gen_random_uuid(), application_id uuid not null references applications on delete cascade, kind text not null check (kind in ('category','tag')), name varchar(120) not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (application_id, kind, name))`

- [ ] **Step 1: 写迁移**

```ts
// packages/database/src/migrations/0051_catalog_pending_items.ts
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists catalog_pending_items (
      item_id uuid primary key default gen_random_uuid(),
      application_id uuid not null references applications(application_id) on delete cascade,
      kind text not null check (kind in ('category', 'tag')),
      name varchar(120) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (application_id, kind, name)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists catalog_pending_items`.execute(db);
}
```

- [ ] **Step 2: 类型检查**

Run: `corepack pnpm --filter @ai-hub/database typecheck`
Expected: PASS。schema.ts 无需改（pending 表仅迁移内使用，服务层用 `sql`/Kysely 泛型访问——若仓库层需要强类型，在 `schema.ts` 补 `CatalogPendingItemsTable` 接口并导出）。

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/migrations/0051_catalog_pending_items.ts
git commit -m "migration: 新增 catalog_pending_items 待审自定义分类/标签表"
```

---

### Task 8: 功能 5b — contracts + 前端自定义分类/标签输入

**Files:**
- Modify: `packages/contracts/src/application.ts`（`ApplicationDraft` :123-151）
- Modify: `apps/web/src/modules/publishing/steps.tsx`（分类 :999-1017、标签 :1018-1032）
- Modify: `apps/web/src/modules/publishing/schema.ts`（:125、:132）
- Modify: `apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx`（提交拆分）
- Test: `apps/web/src/modules/publishing/schema.test.tsx`、`steps.test.tsx`

**Interfaces:**
- Consumes: `ApplicationDraft`（新增字段）
- Produces: `ApplicationDraft` 增加 `customCategoryName?: string`、`customTagNames?: string[]`；表单值含 `customCategoryName`/`customTagNames`

- [ ] **Step 1: 写失败测试**

`schema.test.tsx` 新增：

```tsx
it("分类与自定义分类至少填一个；自定义标签名可多填", () => {
  // { categoryId: "", customCategoryName: "我的分类" } 通过
  // { categoryId: "", customCategoryName: "" } 失败
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/modules/publishing/schema.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `packages/contracts/src/application.ts` `ApplicationDraft` 增加：

```ts
/** 自定义分类名称（未匹配现有分类时填写；categoryId 为空）。 */
customCategoryName?: string;
/** 自定义标签名称列表（未匹配现有标签的部分）。 */
customTagNames?: string[];
```

2. `steps.tsx`：分类 `Select` 改 `mode="tags"` + `maxCount={1}`（options 现有分类，`tokenSeparators` 不需要）；标签 `Select` 改 `mode="tags"`（现有 `mode="multiple"` 语义保留，新名称可输入）。受控值区分：现有 id 与自定义名混合在同一个值数组里，提交时按"是否匹配现有 options 的 value"拆分
3. `schema.ts`：分类校验改为 `z.string()` 可空 + `superRefine` 断言 `categoryId` 或 `customCategoryName` 非空；标签 schema 保持数组
4. `ApplicationCreateWizardPage.tsx` 提交/存草稿处拆分：

```ts
const existingCategoryIds = new Set(options.categories.map((c) => c.value));
const categoryValue = values.categoryId; // tags 模式的单一值或数组首元素
const customCategoryName =
  typeof categoryValue === "string" && !existingCategoryIds.has(categoryValue)
    ? categoryValue
    : undefined;
const existingTagIds = new Set(options.tags.map((t) => t.value));
const tagValues: string[] = values.tagIds ?? [];
const customTagNames = tagValues.filter((v) => !existingTagIds.has(v));
const tagIds = tagValues.filter((v) => existingTagIds.has(v));
// 组装 payload：categoryId（已有 id 或空）、customCategoryName、tagIds、customTagNames
```

（以 `steps.tsx` 表单字段名与页面实际取值方式为准调整。）

- [ ] **Step 4: 运行测试确认通过**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/modules/publishing/ src/pages/creator/`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/application.ts apps/web/src/modules/publishing/ apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx
git commit -m "feat(web): 创建应用支持自定义分类/标签输入（重名自动复用现有）"
```

---

### Task 9: 功能 5c — 后端 submitDraft pending 处理 + 审核流转 + 删除端点

**Files:**
- Modify: `packages/server/src/application/application.service.ts`（`submitDraft` :285-361、`validateDraftCompleteness` :1611-1640、`review` :703-829、`cancelPendingReview` :577-609）
- Modify: `packages/server/src/application/application.repository.ts`（新增 pending 方法）
- Modify: `packages/server/src/application/application.controller.ts`（新增 DELETE 端点）
- Modify: `packages/server/src/application/application.dto.ts`（如需 DTO）
- Modify: `packages/server/src/application/application.types.ts`（`ApplicationRepository` 接口）
- Test: `packages/server/src/application/application.service.test.ts`

**Interfaces:**
- Consumes: `ApplicationDraft.customCategoryName/customTagNames`（Task 8）；`validateDraftCompleteness`（:1611）
- Produces: 仓库方法 `upsertPendingCatalogItem(applicationId, kind: "category"|"tag", name): Promise<void>`、`listPendingCatalogItems(applicationId): Promise<Array<{ itemId, kind, name, createdAt }>>`、`deletePendingCatalogItem(itemId): Promise<void>`、`deletePendingCatalogItemsByApplication(applicationId): Promise<void>`；控制器 `DELETE /internal/applications/:applicationId/catalog-pending-items/:itemId`（`APPLICATION_REVIEW`）；`review()` 通过/驳回的 pending 处置

- [ ] **Step 1: 写失败测试**

`application.service.test.ts` 新增（内存仓库补 pending 记录 + 正式表 upsert 记录）：

```ts
it("submitDraft：自定义分类/标签写入 pending 表，重名复用现有", async () => {
  // 仓库预置现有分类 "productivity"/"效率工具" 与标签 "ai"/"AI"
  // 草稿 { categoryId: "", customCategoryName: "效率工具", customTagNames: ["新标签"], tagIds: [] }
  // 断言：pending 仅含 "新标签"（tag）；"效率工具" 复用现有（不产生 pending）
});

it("review 通过：pending 项插入正式表并关联应用；驳回：pending 删除", async () => {
  // 预置 pending category "我的分类" + tag "我的标签"
  // approve → catalog_categories/tags 含新行（uuid id），metadata.category_id = 新分类 id，tagLinks 含新标签
  // reject → pending 表清空
});

it("删除 pending 项端点：审核员可删，非本应用项 404", async () => {
  // service.deletePendingCatalogItem 归属校验
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server exec vitest run src/application/application.service.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `application.types.ts`：`ApplicationRepository` 接口增加 4 个 pending 方法（签名见 Interfaces）
2. `application.repository.ts`：实现 4 个方法 —— `upsertPendingCatalogItem` 用 `onConflict(["application_id","kind","name"]).doNothing()`；`deletePendingCatalogItem` 按 `item_id` 删除并返回影响行数（0 → 调用方抛 `PENDING_ITEM_NOT_FOUND`）；审核流转用 `withTransaction` 内调用
3. `application.service.ts`：
   - `validateDraftCompleteness`（:1631）：`DRAFT_CATEGORY_REQUIRED` 条件放宽为 `!(draft.categoryId || draft.customCategoryName)`
   - `submitDraft` 事务内（`replaceTagLinks` 后）新增：

```ts
await this.persistPendingCatalogItems(repository, applicationId, sanitizedDraft);
```

```ts
private async persistPendingCatalogItems(
  repository: ApplicationRepository,
  applicationId: string,
  draft: ApplicationDraft,
): Promise<void> {
  const categoryName = draft.customCategoryName?.trim();
  if (categoryName && categoryName.length > 0) {
    if (!(await repository.findCategoryByName(categoryName))) {
      await repository.upsertPendingCatalogItem(applicationId, "category", categoryName);
    }
  }
  for (const name of draft.customTagNames ?? []) {
    const trimmed = name.trim();
    if (trimmed.length === 0) continue;
    if (!(await repository.findTagByName(trimmed))) {
      await repository.upsertPendingCatalogItem(applicationId, "tag", trimmed);
    }
  }
}
```

   （仓库需补 `findCategoryByName(name)`/`findTagByName(name)` —— 按 `lower(name) = lower(${name})` 查询，返回 id 或 null）
   - `review()`：approve 分支在 `registerToCatalog` 前新增 `applyPendingCatalogItems`（事务内）：查 pending 列表 → 逐项 `insertCategory(name)`/`insertTag(name)`（`category_id = gen_random_uuid()::text`，onConflict doNothing 后回查 id）→ 有通过的自定义分类 → `upsertCatalogMetadata(applicationId, { categoryId: 新id, applicationType })`（用 `repository.getApplicationType` 回填）→ 通过的自定义标签 → `replaceTagLinks(applicationId, [...现有 tagIds, ...新ids])`（先查现有 tagLinks 再合并）→ `deletePendingCatalogItemsByApplication`
   - reject 分支与 `cancelPendingReview`：事务内 `deletePendingCatalogItemsByApplication(applicationId)`
   - `registerToCatalog` 的 `categoryId="productivity"` 兜底不变（无自定义分类时生效）
4. `application.controller.ts` 新增两个端点（`application.dto.ts` 补 `PendingCatalogItemDto { itemId, kind, name, createdAt }`）：

```ts
@Get(":applicationId/catalog-pending-items")
@RequiresPermissions(PERMISSIONS.APPLICATION_REVIEW)
@ApiOperation({ summary: "待审自定义分类/标签列表" })
// 委托 service.listPendingCatalogItemsForReview(actor, applicationId)

@Delete(":applicationId/catalog-pending-items/:itemId")
@RequiresPermissions(PERMISSIONS.APPLICATION_REVIEW)
@ApiOperation({ summary: "删除待审自定义分类/标签（审核员）" })
// 委托 service.deletePendingCatalogItem(actor, applicationId, itemId)
```

   service 方法：
   - `listPendingCatalogItemsForReview(actor, applicationId)`：`assertAuthorized(actor, allowedActions.review)` → `requireApplication` → 返回 `listPendingCatalogItems(applicationId)`
   - `deletePendingCatalogItem(actor, applicationId, itemId)`：`assertAuthorized(actor, allowedActions.review)` → 校验 item 属于该应用（`listPendingCatalogItems` 含之，否则 `PENDING_ITEM_NOT_FOUND`）→ `deletePendingCatalogItem(itemId)`

- [ ] **Step 4: 运行测试确认通过**

Run: `corepack pnpm --filter @ai-hub/server exec vitest run src/application/`
Expected: PASS。再跑 `corepack pnpm --filter @ai-hub/server exec vitest run src/` 全量确认无回归。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/application/
git commit -m "feat(server): 自定义分类/标签随审核流转（pending 表 + 通过插入正式表 + 驳回删除 + 审核员删除端点）"
```

---

### Task 10: 功能 5d — 审核工作台自定义项卡片

**Files:**
- Modify: `apps/web/src/pages/applications/ApplicationReviewPage.tsx`（新卡片）
- Modify: `apps/web/src/modules/application/useApplication.ts`（hook）
- Modify: `apps/web/src/modules/application/application.client.ts`（API 函数）
- Test: `apps/web/src/pages/applications/ApplicationReviewPage.test.tsx`

**Interfaces:**
- Consumes: `DELETE /internal/applications/:applicationId/catalog-pending-items/:itemId`（Task 9）
- Produces: 客户端 `listPendingCatalogItems(applicationId)`、`deletePendingCatalogItem(applicationId, itemId)`；hook `usePendingCatalogItems(applicationId)`、`useDeletePendingCatalogItem(applicationId)`

- [ ] **Step 1: 写失败测试**

`ApplicationReviewPage.test.tsx` 新增：mock pending 列表（1 分类 + 1 标签）→ 断言卡片渲染名称与类型标签；点击删除 → 调用 API 并刷新。

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/pages/applications/ApplicationReviewPage.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `application.client.ts`：

```ts
export interface PendingCatalogItem {
  itemId: string;
  kind: "category" | "tag";
  name: string;
  createdAt: string;
}

export function listPendingCatalogItems(applicationId: string): Promise<PendingCatalogItem[]> {
  return apiFetch(`/internal/applications/${encodeURIComponent(applicationId)}/catalog-pending-items`);
}

export function deletePendingCatalogItem(applicationId: string, itemId: string): Promise<unknown> {
  return apiFetch(`/internal/applications/${encodeURIComponent(applicationId)}/catalog-pending-items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}
```

   （GET 列表端点由 Task 9 提供，见 Task 9 Step 3 第 4 条；权限 `APPLICATION_REVIEW`。）
2. `useApplication.ts`：`usePendingCatalogItems(applicationId)`（`["applications", "pending-catalog", applicationId]`）、`useDeletePendingCatalogItem(applicationId)`（成功后 invalidate 该 key）
3. `ApplicationReviewPage.tsx`：在 `ReviewActionCard` 附近新增"自定义分类/标签"卡片：`Tag` 显示 kind（分类/标签）、名称文本、删除按钮（`Popconfirm` 确认）；列表为空不渲染卡片

- [ ] **Step 4: 运行测试确认通过**

Run: `corepack pnpm --filter @ai-hub/web exec vitest run src/pages/applications/`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/application/ apps/web/src/pages/applications/ApplicationReviewPage.tsx
git commit -m "feat(web): 审核工作台展示待审自定义分类/标签，审核员可删除"
```

---

## 收尾验证

全部任务完成后：

```bash
corepack pnpm typecheck
corepack pnpm --filter @ai-hub/server test
corepack pnpm --filter @ai-hub/web test
corepack pnpm --filter @ai-hub/server lint
corepack pnpm --filter @ai-hub/web lint
corepack pnpm exec prettier --check apps/web/src packages/server/src packages/contracts/src packages/database/src
```

手动验证路径（docker 环境）：删除草稿确认仅弹一次；创建向导未点下一步无草稿；选部门后维护人显示该部门成员；向导多选交付提交后详情"立即使用"下拉显示多渠道；创建应用填自定义分类/标签 → 提交 → 审核工作台可见 → 通过后市场分类/标签出现新项；市场右侧面板显示 5 条热门分类可点击过滤。
