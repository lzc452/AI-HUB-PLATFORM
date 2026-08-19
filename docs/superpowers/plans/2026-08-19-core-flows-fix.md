# 核心链路修复计划 — 3 链路验收 + V1 双角色收敛

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭 3 条核心链路验收核查发现的 2 P0 + 17 P1 问题，并实施 V1 双角色收敛（employee + super_admin 分发，其余 19 个预置角色保留定义不实施分发）。

**Architecture:** 后端改动在 `packages/server/src/<domain>`（权限、受众、制品门禁、互动数据源），前端接线在 `apps/web/src/modules|pages`（向导、详情、交付、审核、创作者中心），角色收敛在组织管理 UI + 演示种子。新迁移从 **0048** 起（0046/0047 已预留给两周计划 T18/T19）。

**Tech Stack:** TypeScript、NestJS、Kysely、React 19 + AntD 6 + TanStack Query、Vitest、Testcontainers。

## Global Constraints

- V1 只分发 `employee` + `super_admin` 两种角色；其余 19 个预置角色保留定义、不实施分发（组织管理 UI 不展示、种子不分配）。
- 授权必须后端执行；前端隐藏仅改善体验。
- 错误模型：ProblemDetails + 稳定错误码；前端必须展示字段级 issues。
- 交互 API 的幂等键稳定（T2 后不变式）。
- 迁移命名不可变：本计划新迁移从 0048 起。
- 验证：`corepack pnpm verify`、`corepack pnpm --filter @ai-hub/server test`、`corepack pnpm --filter @ai-hub/web test`。
- 只提交任务文件；工作树有用户未提交残留（identity-cookie、向导 submit-gate 等）——不触碰。

---

## 文件结构

| 文件 | 责任 | 任务 |
|---|---|---|
| `packages/database/src/authorization/system-roles.ts` | employee 增授 demand.claim | A1 |
| `packages/database/src/migrations/0048_employee_demand_claim.ts`（新） | 幂等对齐 employee 权限 | A1 |
| `apps/web/src/pages/creator/*`、`modules/auth/roles.ts` | 角色收敛 UI | A2 |
| `packages/database/src/demo-data/*`、`seed` 脚本 | 演示账号收敛 | A3 |
| `apps/web/src/modules/publishing/schema.ts` + `steps.tsx` | 受众规则映射、错误展示、FAQ | B1, B2, D1 |
| `apps/web/src/shared/api/client.ts` + `application.errors.ts` | ApiError.issues 保留 + 错误码映射 | B2, D1 |
| `apps/web/src/modules/application/application.client.ts` + `useApplication.ts` | acceptUnsigned、维护人、likedByMe/myRating、撤回 | B3, B4, C1, C6, B6 |
| `apps/web/src/pages/applications/ApplicationDeliveryPage.tsx` | 提交确认、制品引导 | B3, B7 |
| `packages/server/src/application/application.service.ts` | 维护人落地、制品门禁、快照读取 | B4, B7, B5 |
| `packages/server/src/application/application.controller.ts` | 快照/差异路由、受众兼容 | B5 |
| `packages/server/src/catalog/catalog.service.ts` + `catalog.controller.ts` | QR 资产、likedByMe/myRating、rating 排序、空 URL | C2, C1, C8, C7 |
| `packages/server/src/interaction/interaction.repository.ts` | 评论 join employees（停用标记） | C4 |
| `apps/web/src/pages/marketplace/*` | 评分回显、二维码、举报、匿名、已赞、风险编辑 | C1-C9 |

---

## 批次 A：角色收敛与链路 1（P0）

### Task A1: employee 增授 demand.claim（L1-P0-1）

**Files:**
- Modify: `packages/database/src/authorization/system-roles.ts`（employee 权限数组）
- Create: `packages/database/src/migrations/0048_employee_demand_claim.ts`
- Modify: `packages/database/src/migrate.ts`
- Modify: `apps/web/src/pages/innovation/*`（DemandGovernanceDrawer 认领方案按钮若被 can(DEMAND_CLAIM) 隐藏则恢复显示——确认按钮逻辑）

**Interfaces:**
- Consumes: `PERMISSIONS.DEMAND_CLAIM`（contracts/identity.ts 已有）
- Produces: employee 角色含 `demand.claim`；迁移 0048 幂等 upsert（对齐 0038/0044 模式）

- [ ] **Step 1: 写失败测试（system-roles 与迁移）**

```ts
// packages/database/src/authorization/system-roles.test.ts 或既有测试文件
it("grants demand.claim to the employee role", () => {
  const employee = SYSTEM_ROLE_DEFINITIONS.find((r) => r.roleCode === "employee");
  expect(employee?.permissions).toContain("demand.claim");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/database test system-roles`
Expected: FAIL

- [ ] **Step 3: 实现**

`system-roles.ts` employee 数组（:24-43）追加 `"demand.claim"`。迁移 0048（对齐 0044 模式）：

```ts
// 0048_employee_demand_claim.ts
import { sql, type Kysely } from "kysely";
import { SYSTEM_ROLE_DEFINITIONS } from "../authorization/system-roles.js";

export async function up(db: Kysely<unknown>): Promise<void> {
  const employeeRole = SYSTEM_ROLE_DEFINITIONS.find(
    (role) => role.roleCode === "employee",
  );
  if (employeeRole === undefined) throw new Error("SYSTEM_ROLE_EMPLOYEE_MISSING");
  await sql`
    insert into roles (role_code, name, permissions, is_system)
    values (${sql.val(employeeRole.roleCode)}, ${sql.val(employeeRole.name)},
      ${sql.val(JSON.stringify(employeeRole.permissions))}::jsonb, true)
    on conflict (role_code) do update
      set name = excluded.name, permissions = excluded.permissions, is_system = true
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    update roles set permissions = (
      select coalesce(jsonb_agg(to_jsonb(p) order by p), '[]'::jsonb)
      from jsonb_array_elements_text(roles.permissions) as v(p)
      where p <> 'demand.claim'
    ) where role_code = 'employee' and permissions ? 'demand.claim'
  `.execute(db);
}
```

- [ ] **Step 4: 前端按钮核对**

读 `DemandGovernanceDrawer.tsx:401-403` 与认领方案入口：确认 `can(PERMISSIONS.DEMAND_CLAIM)` 是否被员工持有后自然显示；若有其他隐藏逻辑一并恢复。创新广场"提交认领方案"按钮需在普通员工视角可见。

- [ ] **Step 5: 测试 + 迁移 + 提交**

```bash
corepack pnpm --filter @ai-hub/database test && corepack pnpm migrate && corepack pnpm --filter @ai-hub/web test
git add packages/database/src/authorization/system-roles.ts packages/database/src/migrations/0048_employee_demand_claim.ts packages/database/src/migrate.ts apps/web/src/pages/innovation/
git commit -m "feat(rbac): grant demand.claim to employee role so staff can submit claim proposals"
```

---

### Task A2: V1 角色收敛实施（L1-P1-3）

**Files:**
- Modify: `apps/web/src/pages/organization/UserManagementTab.tsx`（角色选择收敛为 2 个）
- Modify: `apps/web/src/modules/auth/roles.ts`（如有时钟/角色元数据）

**Interfaces:**
- Consumes: `system-roles.ts` 的 21 角色
- Produces: 组织管理 UI 只展示 employee + super_admin 两种角色可选

- [ ] **Step 1: 写失败测试（UI 角色选项）**

```ts
// apps/web/src/pages/organization/UserManagementTab.test.tsx 或既有测试
it("offers only employee and super_admin roles for assignment in V1", () => {
  render(<UserManagementTab />);
  // 打开角色选择 → 选项仅含 普通员工/超级管理员
  expect(screen.getByText("超级管理员")).toBeInTheDocument();
  expect(screen.queryByText("创新运营管理员")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test UserManagementTab`
Expected: FAIL — 当前列出全部系统角色

- [ ] **Step 3: 实现**

`UserManagementTab.tsx:152-159` 角色选项数据源改为导出常量：

```ts
// modules/auth/roles.ts 新增
/** V1 可分发角色：仅普通员工与超级管理员；其余预置角色保留定义不实施分发。 */
export const ASSIGNABLE_ROLE_CODES: readonly string[] = ["employee", "super_admin"] as const;
```

用户表角色选择与角色管理页（若有）过滤 `ASSIGNABLE_ROLE_CODES`；不可分发角色在列表中显示"预设（未启用）"灰标或直接不展示（以不展示为简洁）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test UserManagementTab
git add apps/web/src/pages/organization/ apps/web/src/modules/auth/roles.ts
git commit -m "feat(org): restrict V1 role assignment to employee and super_admin"
```

---

### Task A3: 演示账号与种子收敛（L1-P1-3 补充）

**Files:**
- Modify: `packages/database/src/demo-data/demo-seed.ts`（或所在位置）
- Modify: 业务种子（demo-business-seed.ts 若依赖 DEMO-INNOVATION 审核需求——改用 DEMO-SUPER-ADMIN）

**Interfaces:**
- Consumes: 演示账号定义
- Produces: 演示环境只分发 employee + super_admin 角色（DEMO-EMPLOYEE、DEMO-SUPER-ADMIN 保留；DEMO-APP-ADMIN/DEMO-INNOVATION/DEMO-ORG-ADMIN 改为 employee 或移除并更新 README 凭据表）

- [ ] **Step 1: 核对种子依赖**

读 `demo-seed.ts` 与 `demo-business-seed.ts`：哪些业务数据依赖 DEMO-APP-ADMIN/DEMO-INNOVATION/DEMO-ORG-ADMIN（审核、需求审核、组织数据）。

- [ ] **Step 2: 实现**

- 演示账号收敛为 2 个：DEMO-EMPLOYEE（employee）、DEMO-SUPER-ADMIN（super_admin）。
- 业务种子中原本以 DEMO-APP-ADMIN/DEMO-INNOVATION 执行的操作改由 DEMO-SUPER-ADMIN 承担（需求审核、应用审核等）。
- 更新 `README.md` 的演示凭据表与 `docs/development` 相关文档。
- 若 seeds 有测试断言账号角色，同步更新。

- [ ] **Step 3: 验证 + 提交**

```bash
corepack pnpm init:dev   # 本地重建种子（注意：仅 dev 库；或运行 seed 测试）
corepack pnpm --filter @ai-hub/database test demo
git add packages/database/src/demo-data/ README.md docs/development/
git commit -m "chore(demo): converge V1 demo accounts to employee and super_admin roles"
```

---

## 批次 B：应用编辑链路（链路 2）

### Task B1: 受众多选 → 多条 AudienceRule（L2-P1-2）

**Files:**
- Modify: `apps/web/src/modules/publishing/schema.ts`（audience 结构）
- Modify: `apps/web/src/modules/publishing/steps.tsx`（多选 → 规则映射 + 展示）
- Modify: `apps/web/src/pages/applications/ApplicationDetailsPage.tsx:386-445`（受众标签解析按多条规则）
- Test: `apps/web/src/modules/publishing/steps.test.tsx` 或既有

**Interfaces:**
- Consumes: `AudienceRule { audienceType, departmentId, employeeId, includeChildren }`（contracts:101-106）
- Produces: 前端"指定部门/指定员工"多选 → 生成多条 `AudienceRule` 记录（每条一个部门/员工），提交 payload 为数组

- [ ] **Step 1: 写失败测试**

```ts
it("expands multi-selected departments into one audience rule per department", () => {
  // 选择 2 个部门 → draft.audience 含 2 条 department 规则 + all 规则
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test publishing`
Expected: FAIL

- [ ] **Step 3: 实现**

`schema.ts` 的 audience 从"单条规则含数组"改为"多条规则"结构：

```ts
// schema.ts —— audience: z.array(AudienceRuleSchema)（每规则单值，与契约一致）
const AudienceRuleSchema = z.object({
  audienceType: z.enum(["all", "department", "employee"]),
  departmentId: z.string().nullable(),
  employeeId: z.string().nullable(),
  includeChildren: z.boolean().default(false),
});
```

`steps.tsx:446-455`：`Select mode="multiple"` 的 onChange 生成多条规则（部门多选 → 每个部门一条 `{audienceType:"department", departmentId, includeChildren:false}`；员工多选同理）；回显时合并展示。

`ApplicationDetailsPage.tsx` 受众标签渲染改为遍历 `audience` 数组。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test publishing
git add apps/web/src/modules/publishing/ apps/web/src/pages/applications/ApplicationDetailsPage.tsx
git commit -m "fix(publishing): map multi-selected audiences to one rule per department/employee"
```

---

### Task B2: 提交失败错误提示（L2-P1-3）

**Files:**
- Modify: `apps/web/src/shared/api/client.ts`（ApiError 保留 issues）
- Modify: `apps/web/src/shared/forms/FormWizard.tsx`（onSubmit 错误捕获展示）
- Modify: `apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx`（handleSubmit try/catch + message.error）
- Modify: `apps/web/src/modules/application/application.errors.ts`（错误码映射）
- Test: `apps/web/src/shared/forms/FormWizard.test.tsx`、wizard 测试

**Interfaces:**
- Consumes: 后端 `DRAFT_VALIDATION_FAILED` 400 + `{ issues: [{ path, message }] }`
- Produces: `ApiError.issues?: ReadonlyArray<{ path: string; message: string }>`；向导提交失败展示 `message.error` + 字段级提示

- [ ] **Step 1: 写失败测试**

```ts
it("surfaces draft validation issues when submit fails", async () => {
  // mock submit 抛 ApiError({ code: "DRAFT_VALIDATION_FAILED", issues: [{path:"faq", message:"必填"}] })
  // 断言 message.error 被调用且含 issues 文案
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test FormWizard`
Expected: FAIL

- [ ] **Step 3: 实现**

`client.ts:78-86`：`ApiError` 增加 `issues` 字段（从 400 body 解析）。`FormWizard.tsx:94-109` 的 finally 改为 catch 透传（onSubmit 内已 catch 则保持）。`ApplicationCreateWizardPage.tsx:141-152` handleSubmit 包 try/catch：失败时 `message.error(formatValidationMessage(err))`；`application.errors.ts` 补映射 `DRAFT_VALIDATION_FAILED`（"提交校验未通过：{issues 摘要}"）、`DELIVERY_TARGETS_INCOMPLETE`、`REVIEW_ALREADY_PENDING`。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test FormWizard wizard
git add apps/web/src/shared/api/client.ts apps/web/src/shared/forms/FormWizard.tsx apps/web/src/pages/creator/ apps/web/src/modules/application/application.errors.ts
git commit -m "fix(creator): surface draft validation issues on submit failure"
```

---

### Task B3: 提交审核 acceptUnsigned 确认（L2-P1-1）

**Files:**
- Modify: `apps/web/src/modules/application/application.client.ts:269-276`（submitApplicationReview 加 body）
- Modify: `apps/web/src/modules/application/useApplication.ts:240-252`
- Modify: `apps/web/src/pages/applications/ApplicationDeliveryPage.tsx:245-249`（提交前弹确认：版本未签名时要求勾选）
- Modify: `apps/web/src/pages/creator/CreatorAppTable.tsx` 或其他提交入口（若有）
- Test: `apps/web/src/modules/application/application.client.test.tsx`

**Interfaces:**
- Consumes: `POST versions/:id/review` body `{ acceptUnsigned?: boolean }`（后端 controller.ts:244-251 已支持）
- Produces: 前端在版本未签名时（`version.signed === false`）提交前弹出确认勾选，勾选后传 `acceptUnsigned: true`

- [ ] **Step 1: 写失败测试**

```ts
it("submits review with acceptUnsigned when confirmed", async () => {
  // mock 未签名版本提交 → 断言请求体含 acceptUnsigned: true
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test application.client`
Expected: FAIL

- [ ] **Step 3: 实现**

`application.client.ts`：

```ts
export async function submitApplicationReview(
  applicationVersionId: string,
  options?: { acceptUnsigned?: boolean },
): Promise<ReviewSubmitResult> {
  return apiFetch<ReviewSubmitResult>(`/internal/applications/versions/${applicationVersionId}/review`, {
    method: "POST",
    body: JSON.stringify({ acceptUnsigned: options?.acceptUnsigned === true }),
  });
}
```

`ApplicationDeliveryPage.tsx`：提交前检查最新版本 `signed === false` → `Modal.confirm`（勾选"我已知晓制品未签名并接受风险"）→ 确认后带 acceptUnsigned 提交；`useApplication.ts` mutation 透传 options。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test application.client ApplicationDeliveryPage
git add apps/web/src/modules/application/ apps/web/src/pages/applications/ApplicationDeliveryPage.tsx
git commit -m "fix(web): confirm unsigned artifacts before submitting review"
```

---

### Task B4: 维护人字段落地（L2-P1-6）

**Files:**
- Modify: `packages/server/src/application/application.service.ts`（submitDraft 写维护人）
- Modify: `packages/server/src/application/application.repository.ts`（setMaintainers）
- Modify: `packages/server/src/application/application.types.ts`（接口）
- Test: `packages/server/src/application/application.service.test.ts`

**Interfaces:**
- Consumes: `draft.maintainerEmployeeIds: string[]`（契约已有）
- Produces: `setMaintainers(applicationId, maintainerEmployeeIds)`；submitDraft/saveDraft 更新 `applications.maintainer_employee_id`（主维护人 = 数组第一个，或维护人 JSON 列——**以现有列语义为准**：`maintainer_employee_id` 单列存储主维护人；多维护人存哪？检查 0003 schema——若只有单列，V1 存主维护人 + 草稿保留完整列表用于自审；若有多维护人表则写入。以实际 schema 为准）

- [ ] **Step 1: 写失败测试**

```ts
it("persists maintainers when a draft is submitted", async () => {
  // submitDraft({ maintainerEmployeeIds: ["E1","E2"] }) → repository.setMaintainers 被调用
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/server test application`
Expected: FAIL

- [ ] **Step 3: 实现**

`application.service.ts` submitDraft 事务内（:272-298 附近）追加 `await repository.setMaintainers(applicationId, draft.maintainerEmployeeIds)`；repository 实现按 schema 写主维护人（多维护人若 schema 不支持则记录为单维护人 + 草稿列表用于自审，报告中说明）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test application
git add packages/server/src/application/
git commit -m "fix(application): persist maintainers on draft submit"
```

---

### Task B5: 版本快照/差异 API（L2-P1-4）

**Files:**
- Modify: `packages/server/src/application/application.controller.ts`（快照读取路由）
- Modify: `packages/server/src/application/application.service.ts`（listVersionSnapshots/getVersionDiff）
- Modify: `packages/server/src/application/application.repository.ts`（读取快照）
- Modify: `apps/web/src/modules/application/application.client.ts` + `useApplication.ts`
- Modify: `apps/web/src/pages/applications/ApplicationVersionsPage.tsx:181-275`（真实数据渲染）
- Test: service 单测 + web 组件测试

**Interfaces:**
- Consumes: `application_version_snapshots` 表（migration 0017，content JSON）
- Produces: `GET /internal/applications/:id/versions/:versionId/snapshot`（返回快照内容）；`GET /internal/applications/:id/versions/:fromVersionId/diff/:toVersionId`（字段级差异：changed/added/removed 字段列表）；前端版本页"版本对比/快照详情"渲染真实数据，删除假数据

- [ ] **Step 1: 写失败测试**

```ts
it("returns the stored snapshot for a version", async () => {
  // 预置快照 → getVersionSnapshot 返回 content
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/server test application`
Expected: FAIL

- [ ] **Step 3: 实现**

- repository：`findVersionSnapshot(versionId)`（读 `application_version_snapshots`）。
- service：`getVersionSnapshot(actor, applicationId, versionId)`（授权 + 读取 + 返回）；`getVersionDiff(actor, applicationId, fromId, toId)`（读两个快照 → 递归对比 JSON 顶层字段 → 返回 `{ changed: [{field, from, to}], added: [...], removed: [...] }`）。
- controller：两个 GET 路由。
- 前端 `ApplicationVersionsPage.tsx`：删除硬编码演示数据（:190-275），接入真实快照/差异渲染；空态展示。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test application && corepack pnpm --filter @ai-hub/web test ApplicationVersionsPage
git add packages/server/src/application/ apps/web/src/modules/application/ apps/web/src/pages/applications/ApplicationVersionsPage.tsx
git commit -m "feat(versions): real snapshot and diff endpoints with frontend rendering"
```

---

### Task B6: 撤回接线（L2-P1-5 / L3-P1-10）

**Files:**
- Modify: `apps/web/src/pages/creator/CreatorAppTable.tsx:234-241`（启用撤回 + 确认）
- Modify: `apps/web/src/modules/application/application.client.ts` + `useApplication.ts`（reviewWithdraw 调用）
- Test: web 组件测试

**Interfaces:**
- Consumes: `POST /internal/applications/versions/:applicationVersionId/review-withdraw`（T5 已实现）
- Produces: in_review 应用的"撤回"按钮启用：点击 → Modal 确认 → 调用 → 成功后刷新列表

- [ ] **Step 1: 写失败测试**

```ts
it("calls review-withdraw when the creator confirms withdrawal", async () => {
  // 渲染 in_review 行 → 点击撤回 → 确认 → 断言 api 调用
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test creator`
Expected: FAIL — 按钮 disabled

- [ ] **Step 3: 实现**

`CreatorAppTable.tsx`：按钮 `disabled` 移除（仅 in_review 行显示）；点击 → `Modal.confirm`（"撤回后该版本将停止审核，可重新提交"）→ `useWithdrawReview().mutate(versionId)`。`application.client.ts` 加 `withdrawApplicationReview(applicationVersionId)`；错误码 `REVIEW_NOT_PENDING` 映射提示。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test creator
git add apps/web/src/pages/creator/CreatorAppTable.tsx apps/web/src/modules/application/
git commit -m "feat(creator): wire review withdrawal to backend"
```

---

### Task B7: 桌面/移动制品门禁（L2-P1-7）

**Files:**
- Modify: `packages/server/src/application/application.service.ts`（submitForReview/approve 门禁）
- Modify: `apps/web/src/pages/applications/ApplicationDeliveryPage.tsx`（无制品引导）
- Test: service 单测

**Interfaces:**
- Consumes: `applicationVersionRecord.artifactKey`、`applicationType`
- Produces: `desktop_app`/`mobile_app` 版本的 submitForReview 要求 artifactKey 非空（否则 `ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE`）；前端交付页在无制品时提示"请先上传安装包"并引导 UploadVersionDrawer

- [ ] **Step 1: 写失败测试**

```ts
it("rejects review submission for desktop/mobile versions without an artifact", async () => {
  await expect(service.submitForReview(actor, "version-no-artifact")).rejects.toThrow("ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/server test application`
Expected: FAIL

- [ ] **Step 3: 实现**

`submitForReview`（:465-483 附近）在 scanStatus 校验后追加：

```ts
const appType = await this.repository.getApplicationType(application.applicationId);
if (
  (appType === "desktop_app" || appType === "mobile_app") &&
  version.artifactKey === null
) {
  throw new Error("ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE");
}
```

（`getApplicationType` 已存在——T12 用过）。前端交付页：`getReviewReadiness` 增加 artifact 检查（desktop/mobile 且最新版本无 artifact → 按钮禁用 + 提示）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test application && corepack pnpm --filter @ai-hub/web test ApplicationDeliveryPage
git add packages/server/src/application/ apps/web/src/pages/applications/ApplicationDeliveryPage.tsx
git commit -m "feat(review): require artifact for desktop/mobile delivery types"
```

---

## 批次 C：使用互动链路（链路 3）

### Task C1: 评分回显 + 已赞状态（L3-P0-1 / L3-P1-6）

**Files:**
- Modify: `packages/contracts/src/catalog.ts`（CatalogEntry 加 `myRating`/`likedByMe`）
- Modify: `packages/server/src/catalog/catalog.repository.ts`（查询当前用户评分/点赞）
- Modify: `packages/server/src/catalog/catalog.service.ts`（透传）
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailHeader.tsx`（Rate value 绑定 + 点赞高亮）
- Modify: `apps/web/src/modules/interaction/useInteraction.ts`（乐观更新 likedByMe）
- Test: 后端单测 + web 组件测试

**Interfaces:**
- Consumes: `catalog.repository.listVisiblePage`（详情经 findVisible）
- Produces: 详情/列表条目带 `myRating: number | null`、`likedByMe: boolean`（基于 actor.employeeId 查询 `application_ratings`/`application_likes`——一条 EXISTS 子查询即可）

- [ ] **Step 1: 写失败测试**

```ts
it("includes myRating and likedByMe in catalog entries", async () => {
  // 预置当前员工评分 4 星 + 点赞 → listVisiblePage 返回 myRating=4, likedByMe=true
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/server test catalog`
Expected: FAIL

- [ ] **Step 3: 实现**

repository 详情查询（findVisible）与列表查询增加两个 EXISTS 子查询（复用 likeCount/ratingAverage 模式）：

```ts
sql<boolean>`exists (select 1 from application_ratings r2 where r2.application_id = application.application_id and r2.employee_id = ${input.actor.employeeId})`.as("myRatingFlag"),
```

（评分值用标量子查询 `(select stars ... where employee_id = $actor)`。）`CatalogEntry` 类型加 `myRating: number | null; likedByMe: boolean`。

前端 `MarketplaceDetailHeader.tsx:34-43,138-143`：`Rate value={entry.myRating}`（非 0 时）可点修改；点赞按钮按 `likedByMe` 显示"已赞"高亮（Theme 色）与文案；`useInteraction.ts` toggleLike 乐观翻转 `likedByMe`（用 `queryClient.setQueryData` 更新 catalog 缓存）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test catalog && corepack pnpm --filter @ai-hub/web test MarketplaceDetail
git add packages/contracts/src/catalog.ts packages/server/src/catalog/ apps/web/src/pages/marketplace/ apps/web/src/modules/interaction/
git commit -m "feat(marketplace): return myRating and likedByMe with optimistic UI state"
```

---

### Task C2: 小程序二维码展示（L3-P0-2）

**Files:**
- Modify: `packages/server/src/catalog/catalog.service.ts`（mini_program 返回 QR 资产）
- Modify: `packages/server/src/catalog/catalog.controller.ts`（QR 资产读取路由或复用 downloadAsset）
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailPage.tsx:148-159`（Modal 渲染图片）
- Test: 后端单测 + web 组件测试

**Interfaces:**
- Consumes: `delivery_targets.qr_code_asset_id`（T12 已存）
- Produces: `resolveDelivery` 对 mini_program 返回 `{ kind: "qr", assetUrl: "/internal/catalog/deliveries/:deliveryId/qr" }`；前端 Modal 用 `<img>` 展示二维码图片（下载端点复用 `CATALOG_READ` + requireVisible 权限）

- [ ] **Step 1: 写失败测试**

```ts
it("resolves mini program delivery to a qr asset url", async () => {
  const resolved = await service.resolveDelivery(actor, "app-1", "mini_program");
  expect(resolved).toEqual(expect.objectContaining({ kind: "qr", assetUrl: expect.stringContaining("/qr") }));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/server test catalog`
Expected: FAIL

- [ ] **Step 3: 实现**

- repository：`findQrAssetForDelivery(deliveryId)`（读 delivery_targets 的 qr_code_asset_id → asset 记录）。
- catalog.service resolveDelivery：mini_program 分支改为查 QR 资产（无资产 → 回退 entryUrl 文本）；controller 新增 `GET /internal/catalog/deliveries/:deliveryId/qr`（授权后流式返回图片，Content-Type image/png）。
- 前端 Modal：`payload` 为 assetUrl 时渲染 `<img>`（含加载失败 fallback 文本）；删除"请使用企业微信扫码 + URL 文本"的纯文本展示。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test catalog && corepack pnpm --filter @ai-hub/web test MarketplaceDetail
git add packages/server/src/catalog/ apps/web/src/pages/marketplace/MarketplaceDetailPage.tsx
git commit -m "feat(marketplace): render mini program QR asset instead of raw url text"
```

---

### Task C3: 评论举报 UI（L3-P1-3）

**Files:**
- Modify: `apps/web/src/modules/interaction/interaction.client.ts`（reportComment）
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailReviews.tsx`（举报按钮 + 原因弹窗）
- Test: web 组件测试

**Interfaces:**
- Consumes: `POST /internal/applications/comments/:commentId/reports`（interaction.controller.ts:137-160 已实现，body `{ reason, category }`——确认 DTO 字段）
- Produces: 每条评论（非官方回复）hover"举报"入口 → 弹窗填原因 → 提交 → 成功提示

- [ ] **Step 1: 写失败测试**

```ts
it("opens a report dialog and submits the reason", async () => {
  // 点击举报 → 弹窗 → 填写 → 提交 → 断言 api 调用含 reason
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test MarketplaceDetailReviews`
Expected: FAIL

- [ ] **Step 3: 实现**

`interaction.client.ts` 加 `reportComment(commentId, { reason, category })`（字段以 ReportRequestDto 为准——读 interaction.controller.ts:137-160 的 DTO）；Reviews 组件每条用户评论加"举报"链接 → `Modal`（原因 TextArea + 分类 Select）→ 提交成功 `message.success("举报已提交")`。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test MarketplaceDetailReviews
git add apps/web/src/modules/interaction/ apps/web/src/pages/marketplace/MarketplaceDetailReviews.tsx
git commit -m "feat(marketplace): comment reporting UI"
```

---

### Task C4: 停用员工显示（L3-P1-4）

**Files:**
- Modify: `packages/server/src/interaction/interaction.repository.ts`（listComments/listRatings join employees）
- Modify: `packages/server/src/interaction/interaction.types.ts`（authorDisabledAt）
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailReviews.tsx`（"已停用用户"标签）
- Test: 后端单测 + web 组件测试

**Interfaces:**
- Consumes: `employees.disabled_at`（identity 表）
- Produces: 评论/评分返回 `authorDisabledAt: string | null`；前端作者处显示"已停用用户"Tag（不显示工号）

- [ ] **Step 1: 写失败测试**

```ts
it("marks comments from disabled employees", async () => {
  // 预置禁用员工评论 → listComments 返回 authorDisabledAt 非空
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/server test interaction`
Expected: FAIL

- [ ] **Step 3: 实现**

repository 两个查询加 `leftJoin employees` + select `employee.disabled_at as authorDisabledAt`；types 加字段；前端 Reviews 组件：`authorDisabledAt !== null` 时渲染 `已停用用户` 灰 Tag 替代工号/姓名。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test interaction && corepack pnpm --filter @ai-hub/web test MarketplaceDetailReviews
git add packages/server/src/interaction/ apps/web/src/pages/marketplace/MarketplaceDetailReviews.tsx
git commit -m "feat(interaction): display disabled-author marker on comments and ratings"
```

---

### Task C5: 匿名选项 UI（L3-P1-5）

**Files:**
- Modify: `apps/web/src/modules/interaction/interaction.client.ts`（rateApplication/createComment 加 displayAnonymously）
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailReviews.tsx`（匿名开关：评分弹窗 + 评论表单）
- Test: web 组件测试

**Interfaces:**
- Consumes: 后端 `displayAnonymously?: boolean`（interaction.service rate/createComment 已支持）
- Produces: 评论表单/评分弹窗加"匿名展示"Switch；提交时传 displayAnonymously

- [ ] **Step 1: 写失败测试**

```ts
it("sends displayAnonymously when the switch is on", async () => {
  // 打开匿名开关 → 提交评论 → 断言请求体 displayAnonymously: true
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test MarketplaceDetailReviews`
Expected: FAIL

- [ ] **Step 3: 实现**

`interaction.client.ts` 两方法加可选参数；Reviews 组件评论表单加 `Switch`（"匿名展示"）+ 评分弹窗同步；说明文案"匿名展示不影响后台审计"。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test MarketplaceDetailReviews
git add apps/web/src/modules/interaction/ apps/web/src/pages/marketplace/MarketplaceDetailReviews.tsx
git commit -m "feat(marketplace): anonymous display option for reviews and ratings"
```

---

### Task C6: web 空 URL 处理（L3-P1-7）

**Files:**
- Modify: `packages/server/src/catalog/catalog.service.ts:136-138`（空 entryUrl 检查）
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailPage.tsx:135-136`（空/非法 URL 禁用按钮 + 提示）
- Test: 后端单测

**Interfaces:**
- Consumes: `delivery.entryUrl`
- Produces: entryUrl 为空或非 http(s) 时 resolveDelivery 抛 `WEB_DELIVERY_URL_MISSING`（或返回 kind:"unavailable"）；前端按钮 disabled + tooltip"交付地址未配置"

- [ ] **Step 1: 写失败测试**

```ts
it("rejects web deliveries without an entry url", async () => {
  await expect(service.resolveDelivery(actor, "app-1", "web")).rejects.toThrow("WEB_DELIVERY_URL_MISSING");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/server test catalog`
Expected: FAIL

- [ ] **Step 3: 实现**

service 分支加校验（空/null/非 http(s) 前缀）；前端详情页"立即使用"按钮按 resolve 结果 disabled（解析失败或 unavailable 时 tooltip）。T11 白名单已拦新写入，此修复覆盖空值与历史数据。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test catalog && corepack pnpm --filter @ai-hub/web test MarketplaceDetail
git add packages/server/src/catalog/catalog.service.ts apps/web/src/pages/marketplace/MarketplaceDetailPage.tsx
git commit -m "fix(catalog): guard empty web delivery urls"
```

---

### Task C7: "评分最高"排序修复（L3-P1-8）

**Files:**
- Modify: `packages/server/src/catalog/catalog.repository.ts`（rating 排序支持）
- Modify: `packages/server/src/catalog/catalog.controller.ts`（sort 参数）
- Modify: `apps/web/src/pages/marketplace/MarketplacePage.tsx:32,76-81`（传 rating 排序 + 删页内重排）
- Test: 集成测试

**Interfaces:**
- Consumes: `sort: "recent" | "popular" | "rating"`（现 popular=likeCount）
- Produces: 后端支持 `rating` 排序（`order by ratingAverage desc nulls last`）；前端移除页内评分重排

- [ ] **Step 1: 写失败测试（集成）**

```ts
// apps/api/test/catalog-search.integration.test.ts 或既有 catalog 集成
it("sorts by average rating across pages", async () => { ... });
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/api test catalog`
Expected: FAIL

- [ ] **Step 3: 实现**

repository 排序分支加 `"rating"`：`orderBy(sql`(select avg(stars) ...) desc`), nulls last`（用 ratingAverage 子查询表达式——注意子查询在 ORDER BY 中重复计算可接受，600 应用量级）；controller 透传；前端删页内重排。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/api test catalog && corepack pnpm --filter @ai-hub/web test MarketplacePage
git add packages/server/src/catalog/ apps/web/src/pages/marketplace/MarketplacePage.tsx
git commit -m "fix(catalog): server-side rating sort across pages"
```

---

### Task C8: 风险说明编辑入口（L3-P1-9）

**Files:**
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailPage.tsx:263`（isOwner 计算）
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailRisk.tsx`（编辑弹窗）
- Modify: `apps/web/src/modules/application/application.client.ts`（updateRiskDescription）
- Test: web 组件测试

**Interfaces:**
- Consumes: 后端 `PATCH /internal/catalog/:applicationId/risk`（catalog.controller.ts:317 附近已实现——T1 报告说 catalog.repository.ts:406 有 risk_description 更新）
- Produces: owner/maintainer 显示"编辑风险说明"按钮 → 弹窗编辑 → 保存（审计由后端保证）

- [ ] **Step 1: 写失败测试**

```ts
it("shows risk edit for owner and saves changes", async () => {
  // owner 视角 → 编辑按钮可见 → 保存 → 断言 api 调用
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test MarketplaceDetail`
Expected: FAIL

- [ ] **Step 3: 实现**

`MarketplaceDetailPage.tsx:263` 硬编码 `isOwner={false}` 改为从 actor/capabilities 计算（`canEditRisk` 已存在——`capabilities.canEditRisk` 传入）；Risk 组件编辑弹窗（TextArea + 保存）；client 加 `updateRiskDescription(applicationId, { riskDescription })`（字段名以后端 DTO 为准）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test MarketplaceDetail
git add apps/web/src/pages/marketplace/ apps/web/src/modules/application/application.client.ts
git commit -m "feat(marketplace): enable risk description editing for owners"
```

---

## 批次 D：P2 核心体验

### Task D1: 错误码本地化 + 状态中文化 + 评论刷新（L2-P2-2 / L3-P2-11 / L3-P2-14）

**Files:**
- Modify: `apps/web/src/modules/application/application.errors.ts`（映射补齐）
- Modify: `apps/web/src/pages/applications/ApplicationReviewPage.tsx:442` + `ApplicationDetailsPage.tsx:128`（statusMeta 中文）
- Modify: `apps/web/src/modules/interaction/useInteraction.ts:102-115`（评论刷新带 page）

**Interfaces:**
- Consumes: 各错误码、statusMeta（creatorMeta 已有中文映射）
- Produces: 全部后端错误码有前端文案；应用状态直显中文；评论提交后刷新当前页

- [ ] **Step 1: 写失败测试**

```ts
it("maps all backend error codes to user-facing messages", () => {
  for (const code of ["DELIVERY_TARGETS_INCOMPLETE", "REVIEW_ALREADY_PENDING", "DRAFT_VALIDATION_FAILED", "ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE", "WEB_DELIVERY_URL_MISSING"]) {
    expect(getErrorMessage(code)).not.toBe(code);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test application.errors`
Expected: FAIL

- [ ] **Step 3: 实现**

`application.errors.ts` 补映射；ReviewPage/DetailsPage 状态用 `statusMeta` 中文 Tag（与管理表一致）；`useInteraction` 评论 mutation 的 invalidate 带 `page` 参数（`["interactions","comments",applicationId,page]`——若缓存键结构不同按实际调整）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test application.errors ReviewPage ApplicationDetails
git add apps/web/src/modules/application/application.errors.ts apps/web/src/pages/applications/ apps/web/src/modules/interaction/useInteraction.ts
git commit -m "fix(web): localize error codes, zh status labels, page-aware comment refresh"
```

---

### Task D2: FAQ 填写入口 + 预览完整渲染 + 展示修复（L2-P2-1 升级 P1 / L2-P2-4 / L3-P2-12 / L3-P2-13）

> 规格 §5.4 应用包含"操作手册、使用示例和常见问题"——FAQ 是必填项，向导缺填写入口属 P1 级缺口。

**Files:**
- Modify: `apps/web/src/modules/publishing/schema.ts`（faq 必填校验）
- Modify: `apps/web/src/modules/publishing/steps.tsx`（FAQ 编辑入口 + 预览完整渲染 deliveries/targets/faq/risk/受众具体项）
- Modify: `apps/web/src/pages/applications/ApplicationVersionsPage.tsx:14-21`（scanStatus 中文标签）
- Modify: `packages/server/src/catalog/catalog.controller.ts:373-385`（CATALOG_DELIVERY_ASSET_NOT_FOUND → 404）
- Modify: `apps/web/src/pages/marketplace/MarketplacePage.tsx:70-74`（部门筛选后端化）
- Modify: `packages/server/src/catalog/catalog.repository.ts` + `catalog.controller.ts`（department 查询参数）
- Test: web 组件测试 + 后端单测

**Interfaces:**
- Consumes: `FaqEntry { question, answer }`（contracts:96-99）；`draft.faq`
- Produces: 向导"内容"步加 FAQ 编辑器（可增删条目）；预览步骤渲染 deliveries（渠道/URL/OS/平台）、targets、faq、risk 全字段、受众具体部门/员工名；scanStatus 显示"校验通过/校验中/校验失败"；下载资产 404 语义正确；部门筛选由服务端 `departmentId` 参数过滤（分页正确）

- [ ] **Step 1: 写失败测试**

```ts
it("renders delivery targets, faq and risk details in preview", async () => {
  // draft 含 targets/faq/risk → PreviewStep 渲染各项
});
it("maps asset-not-found to 404", async () => {
  // mock 抛 CATALOG_DELIVERY_ASSET_NOT_FOUND → 断言 404 映射
});
```

- [ ] **Step 2: 运行确认失败**

Run: `corepack pnpm --filter @ai-hub/web test publishing` + `corepack pnpm --filter @ai-hub/server test catalog`
Expected: FAIL

- [ ] **Step 3: 实现**

- steps.tsx"内容"步：FAQ 增删编辑器（question/answer 两列 + 删除按钮）；faq 空时 zod 校验失败（`z.array(FaqSchema).min(1)`——注意与规格一致：FAQ 必填）。
- PreviewStep（:1062-1149）：补齐 deliveries/targets/faq/risk（retentionPeriod/providerNote）/受众（按规则显示部门/员工名）。
- 版本页 scanStatus 用中文标签映射。
- catalog.controller 错误映射补 `CATALOG_DELIVERY_ASSET_NOT_FOUND → NotFoundException(404)`。
- 市场列表部门筛选：前端传 `departmentId` 查询参数（删除页内过滤），后端 repository 加 `department_id` 过滤（`metadata.department_id = $1`——以实际列名为准）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/web test publishing MarketplacePage && corepack pnpm --filter @ai-hub/server test catalog
git add apps/web/src/modules/publishing/ apps/web/src/pages/marketplace/MarketplacePage.tsx apps/web/src/pages/applications/ApplicationVersionsPage.tsx packages/server/src/catalog/
git commit -m "feat(web): FAQ editor, full preview rendering, zh scan labels, server-side dept filter"
```

---

## 收尾 — 验收

全部任务完成后：

1. 跑 `corepack pnpm verify`（全量门禁）。
2. 用演示账号（DEMO-EMPLOYEE / DEMO-SUPER-ADMIN）走 3 条链路手工/脚本验收：员工市场→详情→互动→创新广场→认领方案→通知→创作者中心；管理员审核/治理全流程；应用新增编辑版本上传使用全链路。
3. 更新 PRD2APP.md 与三份链路报告的状态标注（已修复项打 ✅）。
4. 提交并推送 GitHub（用户已授权）。
