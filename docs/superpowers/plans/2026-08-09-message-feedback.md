# 前端 Message 反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `apps/web` 的运行时错误、警告和操作结果统一迁移到 Ant Design `message`，消除页面布局内的错误提示占位。

**Architecture:** 在 `apps/web/src/shared/ui/message.tsx` 提供错误/警告/成功提示封装及无布局反馈组件。查询错误页面使用 `MessageError`，mutation 在对应 hook 的 `onError`/`onSuccess` 中触发反馈；静态只读说明、字段校验和空状态保持现状。

**Tech Stack:** React 19、TypeScript、Ant Design 6、TanStack Query 5、Vitest、Testing Library。

## Global Constraints

- 用户可见文案、Markdown 文档、代码注释和提交说明使用简体中文。
- 标识符、路由、事件类型、配置键、命令和技术专名保持英文原样。
- 运行时错误不得继续通过页面布局渲染 `Alert` 或 `ErrorBlock` 占位。
- 字段级 `Form.Item` 校验、`Empty` 空状态、`Tag` 业务状态和只读说明 `Alert` 不迁移。
- 实现遵循 TDD：每个新行为先写失败测试并确认失败，再写最小实现。

---

### Task 1: 建立共享 Message 反馈模块

**Files:**
- Create: `apps/web/src/shared/ui/message.tsx`
- Test: `apps/web/src/shared/ui/message.test.tsx`

**Interfaces:**
- Produces `getMessageContent(cause: unknown, fallback: string): string`。
- Produces `showErrorMessage(cause: unknown, fallback: string): void`。
- Produces `showWarningMessage(content: string): void`。
- Produces `showSuccessMessage(content: string): void`。
- Produces `MessageError` and `MessageWarning` components that return no layout node and emit once per active content.

- [ ] **Step 1: Write the failing behavior tests**

测试使用 Vitest mock 的 Ant Design `message` 作为外部副作用边界，验证真实共享模块：错误详情与上下文拼接、重复渲染去重、warning/success 类型选择，以及 inactive 后同一内容能够再次提示。

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @ai-hub/web test -- src/shared/ui/message.test.tsx`

Expected: FAIL because `apps/web/src/shared/ui/message.tsx` does not exist yet。

- [ ] **Step 3: Implement the minimal shared module**

`getMessageContent` 对 `Error`/字符串取详情，对未知值使用 fallback；`MessageError` 和 `MessageWarning` 使用 `useEffect` 与 `useRef`，只在 active 内容变化时调用对应的 `message` 方法，并始终返回 `null`。

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm --filter @ai-hub/web test -- src/shared/ui/message.test.tsx`

Expected: PASS。

### Task 2: 迁移查询和页面级错误提示

**Files:**
- Modify: `apps/web/src/components/common/ErrorBlock.tsx`
- Modify: `apps/web/src/pages/applications/ApplicationsPage.tsx`
- Modify: `apps/web/src/pages/applications/ApplicationDetailsPage.tsx`
- Modify: `apps/web/src/pages/applications/ApplicationVersionsPage.tsx`
- Modify: `apps/web/src/pages/applications/ApplicationReviewPage.tsx`
- Modify: `apps/web/src/pages/applications/ApplicationDeliveryPage.tsx`
- Modify: `apps/web/src/pages/creator/CreatorAppTable.tsx`
- Modify: `apps/web/src/pages/creator/CreatorCenterPage.tsx`
- Modify: `apps/web/src/pages/creator/CreatorTrendChart.tsx`
- Modify: `apps/web/src/pages/innovation/InnovationSquarePage.tsx`
- Modify: `apps/web/src/pages/innovation/InnovationDemandDetailPage.tsx`
- Modify: `apps/web/src/pages/marketplace/MarketplacePage.tsx`
- Modify: `apps/web/src/pages/marketplace/MarketplaceDetailPage.tsx`
- Modify: `apps/web/src/pages/notifications/NotificationsPage.tsx`
- Modify: `apps/web/src/pages/organization/OrganizationPage.tsx`
- Modify: `apps/web/src/pages/security/SecurityPage.tsx`
- Modify: `apps/web/src/pages/auth/LoginPage.tsx`
- Modify: `apps/web/src/router/guards.tsx`

**Interfaces:**
- Consumes `MessageError` from Task 1。
- Produces no page-layout error block for query/auth/interaction errors。

- [ ] **Step 1: Update the affected page tests to assert Message content and no retry/Alert layout**

将创作者中心、登录、市场详情和助手相关断言从布局按钮/Alert 结构改为可见 Message 文案；保留成功渲染、空状态和权限状态断言。

- [ ] **Step 2: Run the affected tests and verify the migration assertions fail**

Run: `pnpm --filter @ai-hub/web test -- src/creator.test.tsx src/auth.test.tsx src/pages/marketplace/MarketplaceDetailPage.test.tsx`

Expected: FAIL because current pages still render old layout blocks and do not use the new shared component。

- [ ] **Step 3: Replace runtime error branches with `MessageError`**

删除错误 `Alert`/`ErrorBlock` 的布局 action，使用页面标题和原错误详情传入 `MessageError`；保留加载状态、空状态、字段校验和只读说明。公共 `ErrorBlock` 改为兼容的无布局 Message 包装，避免遗漏尚未直接改写的调用方。

- [ ] **Step 4: Run the affected tests and verify they pass**

Run: `pnpm --filter @ai-hub/web test -- src/creator.test.tsx src/auth.test.tsx src/pages/marketplace/MarketplaceDetailPage.test.tsx`

Expected: PASS。

### Task 3: 补齐 mutation 的错误、警告和成功反馈

**Files:**
- Modify: `apps/web/src/modules/application/useApplication.ts`
- Modify: `apps/web/src/modules/notification/useNotification.ts`
- Modify: `apps/web/src/modules/innovation/useDemand.ts`
- Modify: `apps/web/src/modules/interaction/useInteraction.ts`
- Modify: `apps/web/src/pages/innovation/InnovationDemandDetailPage.tsx`
- Modify: `apps/web/src/pages/marketplace/detail/MarketplaceDetailHeader.tsx`
- Modify: `apps/web/src/pages/assistant/AssistantPage.tsx`
- Modify: `apps/web/src/modules/auth/auth.context.tsx`

**Interfaces:**
- Consumes `showErrorMessage`, `showWarningMessage`, and `showSuccessMessage` from Task 1。
- Produces user-visible feedback for every scoped mutation and the assistant degradation state。

- [ ] **Step 1: Add failing tests for mutation feedback branches**

为共享 helper 增加 mutation callback 行为测试，并更新现有组件测试覆盖：成功操作显示 success，失败操作显示 error，助手降级显示 warning 且不产生布局节点。

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm --filter @ai-hub/web test -- src/shared/ui/message.test.tsx src/assistant.test.tsx src/pages/marketplace/MarketplaceDetailPage.test.tsx`

Expected: FAIL because mutation callbacks and assistant degradation still lack统一反馈。

- [ ] **Step 3: Add the minimal callbacks and replace the remaining runtime Alert**

在撤回、归档、通知已读、需求点赞、评论、应用点赞和评分的 `useMutation` 中分别接入错误与成功提示；登录成功使用 success；助手降级使用 `MessageWarning`；市场互动失败使用 `MessageError`。

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm --filter @ai-hub/web test -- src/shared/ui/message.test.tsx src/assistant.test.tsx src/pages/marketplace/MarketplaceDetailPage.test.tsx`

Expected: PASS。

### Task 4: 全量验证与项目记录

**Files:**
- Modify: `processing_visualization.html`

- [ ] **Step 1: Scan the final source for runtime layout error placeholders**

Run: `rg -n --glob '!node_modules/**' --glob '*.{ts,tsx}' '<Alert|ErrorBlock|isError|error\\.message|message\\.(error|warning|success)' apps/web/src`

Expected: remaining `Alert` entries are only explicitly retained read-only/info/empty/field-level states; runtime error branches use `MessageError` or imperative `message`。

- [ ] **Step 2: Run frontend tests, typecheck, lint, and build**

Run: `pnpm --filter @ai-hub/web test`

Run: `pnpm --filter @ai-hub/web typecheck`

Run: `pnpm --filter @ai-hub/web lint`

Run: `pnpm --filter @ai-hub/web build`

Expected: each command exits with code 0。

- [ ] **Step 3: Update the processing visualization**

在根目录 `processing_visualization.html` 的 `seedData` 与 `events` 中记录本次 UI/dev/test 改动、迁移结果和验证命令结果，保持事实简短并使用简体中文。

- [ ] **Step 4: Review the final diff and completion evidence**

Run: `git -c safe.directory=D:/workspace/AI-HUB-PLATFORM diff --check; git -c safe.directory=D:/workspace/AI-HUB-PLATFORM status --short`

确认没有无关文件变更、没有布局内运行时错误占位，并根据命令输出再报告完成状态。
