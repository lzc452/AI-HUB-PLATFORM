# 普通员工路由权限恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复开发数据库权限版本落后导致 `DEMO-EMPLOYEE` 登录后无可访问路由的问题，并阻止 `dev:api` 在待执行 migration 存在时直接启动。

**Architecture:** 保持 `0013_unified_authorization` 为旧权限到规范权限的唯一转换来源，不在 Web 或 API 增加兼容分支。根 `dev:api` 命令在启动 NestJS watch 进程前串行执行幂等 migration；真实 PostgreSQL 与 demo 账号回归验证数据库、登录 actor、API 和 Web 路由四层一致。

**Tech Stack:** pnpm 10、Node.js `node:test`、NestJS、React、Vitest、Kysely、PostgreSQL、Docker Compose

## 全局约束

- Node.js 最低版本保持 `18.18.0`，不得引入新依赖。
- 用户可见文案、Markdown 和代码注释使用简体中文；标识符、命令、路由、权限编码和技术专名保持英文。
- 不修改生产启动策略；生产继续显式执行 migration。
- 不把 `marketplace.read` 映射逻辑加入 Web 或 API；旧权限只由 migration 转换。
- 保留当前工作区已有的 `apps/api/src/main.ts`、`apps/worker/src/main.ts`、架构图、应用管理设计稿及图片等无关改动。
- 所有生产行为改动必须先有失败测试；仅暂存和提交本任务明确列出的文件。

## 文件结构

- Create: `scripts/dev-api-migration.test.mjs` — 以伪 `pnpm` 可执行文件验证根 `dev:api` 的命令顺序和失败阻断行为。
- Modify: `package.json` — 让 `dev:api` 先执行 `pnpm migrate`，成功后再启动 API watch 进程。
- Modify: `apps/api/test/demo-accounts.real.e2e-spec.ts` — 固化所有 demo 账号均继承 `employee` 基础权限的真实 PostgreSQL 回归。
- Modify: `processing_visualization.html` — 把 `t-026` 从“进行中”更新为有验证证据的最终状态，并补充完成事件。

---

### Task 1: 开发 API 启动前 migration 契约

**Files:**
- Create: `scripts/dev-api-migration.test.mjs`
- Modify: `package.json:12`
- Test: `scripts/dev-api-migration.test.mjs`

**Interfaces:**
- Consumes: 根 `package.json` 的 `scripts.dev:api`，以及当前 `PATH` 中真实 pnpm 的绝对路径。
- Produces: `pnpm dev:api` 必须先调用 `pnpm migrate`；migration 非零退出时不得调用 `pnpm --filter @ai-hub/api dev`。

- [ ] **Step 1: 编写失败的启动顺序与失败阻断测试**

```javascript
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

async function createFakePnpm(testContext, migrateExitCode) {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-hub-dev-api-"));
  const logPath = path.join(directory, "pnpm.log");
  const executablePath = path.join(
    directory,
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  );
  const source =
    process.platform === "win32"
      ? [
          "@echo off",
          '>>"%AI_HUB_TEST_PNPM_LOG%" echo %*',
          'if "%1"=="migrate" exit /b %AI_HUB_TEST_MIGRATE_EXIT%',
          "exit /b 0",
          "",
        ].join("\r\n")
      : [
          "#!/bin/sh",
          'printf \'%s\\n\' "$*" >> "$AI_HUB_TEST_PNPM_LOG"',
          'if [ "$1" = "migrate" ]; then exit "$AI_HUB_TEST_MIGRATE_EXIT"; fi',
          "exit 0",
          "",
        ].join("\n");

  await writeFile(executablePath, source, "utf8");
  if (process.platform !== "win32") await chmod(executablePath, 0o755);
  testContext.after(() => rm(directory, { force: true, recursive: true }));

  return { directory, logPath, migrateExitCode };
}

function runDevApi(fake) {
  const lookup = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    [process.platform === "win32" ? "pnpm.cmd" : "pnpm"],
    { encoding: "utf8" },
  );
  assert.equal(lookup.status, 0, lookup.stderr);
  const packageManagerPath = lookup.stdout.trim().split(/\r?\n/)[0];
  assert.ok(packageManagerPath, "无法解析真实 pnpm 路径");
  const command =
    process.platform === "win32"
      ? (process.env.ComSpec ?? "cmd.exe")
      : packageManagerPath;
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `"${packageManagerPath}" run dev:api`]
      : ["run", "dev:api"];

  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AI_HUB_TEST_MIGRATE_EXIT: String(fake.migrateExitCode),
      AI_HUB_TEST_PNPM_LOG: fake.logPath,
      PATH: `${fake.directory}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
}

async function readInvocations(logPath) {
  return (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

test("dev:api 在启动 API 前先执行 migration", async (testContext) => {
  const fake = await createFakePnpm(testContext, 0);
  const result = runDevApi(fake);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(await readInvocations(fake.logPath), [
    "migrate",
    "--filter @ai-hub/api dev",
  ]);
});

test("migration 失败时 dev:api 不启动 API", async (testContext) => {
  const fake = await createFakePnpm(testContext, 23);
  const result = runDevApi(fake);

  assert.notEqual(result.status, 0);
  assert.deepEqual(await readInvocations(fake.logPath), ["migrate"]);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm exec node --test scripts/dev-api-migration.test.mjs`

Expected: FAIL；第一个测试只记录 `--filter @ai-hub/api dev`，第二个测试错误地启动 API，证明当前 `dev:api` 跳过 migration。

- [ ] **Step 3: 实施最小 package script 修复**

将根 `package.json` 中的命令改为：

```json
"dev:api": "pnpm migrate && pnpm --filter @ai-hub/api dev"
```

- [ ] **Step 4: 验证 GREEN 与根脚本测试**

Run: `pnpm exec node --test scripts/dev-api-migration.test.mjs`

Expected: PASS，2 tests。

Run: `node --test scripts/*.test.mjs`

Expected: 所有根脚本测试 PASS，0 failures。

- [ ] **Step 5: 提交启动契约修复**

```powershell
git add -- package.json scripts/dev-api-migration.test.mjs
git commit -m "修复: 开发 API 启动前执行数据库迁移"
```

---

### Task 2: Demo 账号基础权限真实集成回归

**Files:**
- Modify: `apps/api/test/demo-accounts.real.e2e-spec.ts`
- Test: `apps/api/test/demo-accounts.real.e2e-spec.ts`

**Interfaces:**
- Consumes: `DEMO_ACCOUNT_DEFINITIONS`、`seedDemoAccounts`、`IdentityService.loginWithPassword` 和真实 PostgreSQL migration。
- Produces: 每个 demo 账号登录 actor 至少包含 `catalog.read`、`demand.read`、`notification.read`；组织管理员 API 响应包含 `employee` 基础角色和增量角色。

- [ ] **Step 1: 运行现有真实 e2e 并记录当前失败**

Run: `pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts`

Expected: 当前 endpoint 用例对 `DEMO-ORG-ADMIN` 的 `roleCodes` 仍断言为单独 `organization_admin`，与统一基础角色契约不一致并失败；如果环境阻止 Testcontainers，记录环境错误而不改写预期。

- [ ] **Step 2: 增加所有 demo 账号的基础权限断言**

在测试文件中增加独立字面量：

```typescript
const BASE_EMPLOYEE_PERMISSIONS = [
  "catalog.read",
  "demand.read",
  "notification.read",
] as const;
```

在 `it.each(DEMO_ACCOUNT_DEFINITIONS)` 登录断言后增加：

```typescript
expect(result.actor.permissions).toEqual(
  expect.arrayContaining([...BASE_EMPLOYEE_PERMISSIONS]),
);
```

把 endpoint 用例的 actor 断言改为：

```typescript
actor: {
  employeeId: "DEMO-ORG-ADMIN",
  roleCodes: ["employee", "organization_admin"],
  permissions: expect.arrayContaining([
    ...BASE_EMPLOYEE_PERMISSIONS,
    "identity.employee.read",
    "identity.department.read",
  ]),
  sessionId: expect.any(String),
},
```

- [ ] **Step 3: 运行真实 e2e 并确认 GREEN**

Run: `pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts`

Expected: PASS，所有五个 demo 账号和 password login endpoint 均通过。

- [ ] **Step 4: 提交真实账号回归测试**

```powershell
git add -- apps/api/test/demo-accounts.real.e2e-spec.ts
git commit -m "测试: 覆盖演示账号基础路由权限"
```

---

### Task 3: 当前开发库迁移与真实 API/Web 回归

**Files:**
- Modify: none
- Test: 本地 PostgreSQL、NestJS API 和 React Web 运行态

**Interfaces:**
- Consumes: 根 `.env` 的 `DATABASE_URL`、Compose PostgreSQL、`pnpm migrate`、demo 账号和 `/internal` API。
- Produces: 本地 migration 到达 `0014`；`DEMO-EMPLOYEE` 获得规范权限；基础路由/API 可访问，管理 API 仍为 403。

- [ ] **Step 1: 从 `.env` 加载数据库地址并应用 migration**

```powershell
$taskDatabaseUrlLine = Get-Content -LiteralPath .env | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
if (-not $taskDatabaseUrlLine) { throw 'DATABASE_URL_MISSING' }
$env:DATABASE_URL = $taskDatabaseUrlLine.Substring('DATABASE_URL='.Length)
pnpm migrate
```

Expected: exit 0；`0013_unified_authorization` 与 `0014_demand_comment_likes_and_priority` 成功应用。

- [ ] **Step 2: 只读验证 migration 与 employee 角色数据**

```powershell
docker compose exec -T postgres psql -U ai_hub -d ai_hub -c "select name from kysely_migration order by timestamp desc limit 2;"
docker compose exec -T postgres psql -U ai_hub -d ai_hub -c "select er.role_code, r.permissions from employee_roles er join roles r on r.role_code=er.role_code where er.employee_id='DEMO-EMPLOYEE' order by er.role_code;"
```

Expected: 最新两条为 `0014_demand_comment_likes_and_priority`、`0013_unified_authorization`；`employee` 权限包含 `catalog.read`、`demand.read`、`notification.read`，且不包含 `marketplace.read`。

- [ ] **Step 3: 通过新的 `dev:api` 启动 API**

Run: `pnpm dev:api`

Expected: migration 命令先成功退出，再出现 NestJS API listening 日志；migration 失败时不得启动 API。

- [ ] **Step 4: 真实登录并验证允许/拒绝边界**

```powershell
$taskLoginBody = @{ employeeId = 'DEMO-EMPLOYEE'; password = 'Demo-Employee-2026!' } | ConvertTo-Json
$taskLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/internal/identity/login/password' -ContentType 'application/json' -Body $taskLoginBody
$taskRequired = @('catalog.read', 'demand.read', 'notification.read')
foreach ($taskPermission in $taskRequired) { if ($taskLogin.actor.permissions -notcontains $taskPermission) { throw "PERMISSION_MISSING:$taskPermission" } }
$taskHeaders = @{ 'x-employee-id' = $taskLogin.actor.employeeId; 'x-session-id' = $taskLogin.actor.sessionId }
$taskCatalog = Invoke-WebRequest -UseBasicParsing -Headers $taskHeaders -Uri 'http://127.0.0.1:3000/internal/catalog'
if ($taskCatalog.StatusCode -ne 200) { throw "CATALOG_STATUS:$($taskCatalog.StatusCode)" }
try {
  Invoke-WebRequest -UseBasicParsing -Headers $taskHeaders -Uri 'http://127.0.0.1:3000/internal/identity/employees'
  throw 'EMPLOYEE_ADMIN_ROUTE_UNEXPECTEDLY_ALLOWED'
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw }
}
```

Expected: 登录 actor 含三项基础权限，目录 API 为 200，组织员工管理 API 为 403。

- [ ] **Step 5: 启动 Web 并执行浏览器回归**

Run: `pnpm dev:web`

在本地 Web 使用 `DEMO-EMPLOYEE` 登录，验证：

- 应用市场、创新广场、站内通知菜单可见且页面可进入；
- 组织管理、系统安全、数据看板菜单不可见；
- 直接访问 `/organization` 显示无权限状态，不能泄露页面数据；
- 刷新 `/marketplace` 后 actor 能从 session 恢复，基础菜单仍可见。

---

### Task 4: 全量验证与缺陷闭环

**Files:**
- Modify: `processing_visualization.html`
- Test: 根级质量命令和专项测试

**Interfaces:**
- Consumes: Task 1–3 的测试结果、数据库查询和浏览器证据。
- Produces: `t-026` 的最终事实记录，以及可重复执行的完整验证结果。

- [ ] **Step 1: 运行专项与全量静态验证**

```powershell
pnpm exec node --test scripts/dev-api-migration.test.mjs
pnpm --filter @ai-hub/web test -- src/modules/auth/auth-access.test.tsx
pnpm --filter @ai-hub/database test -- src/authorization/system-roles.test.ts src/demo-seed.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Expected: 所有命令 exit 0，测试 0 failures，typecheck/lint/build 无错误。

- [ ] **Step 2: 更新 `t-026` 为真实最终状态**

如果 Task 1–4 全部有新鲜成功证据，将 `processing_visualization.html` 中 `t-026` 更新为：

```javascript
status: "已完成",
end: "2026-08-10",
progress:
  "开发 API 启动已强制先执行 migration；本地库已应用 0013/0014，DEMO-EMPLOYEE 恢复应用市场、创新广场和站内通知等基础路由。",
problem:
  "运行库曾停留在 migration 0012，employee 角色只含旧权限 marketplace.read，与当前 catalog.read 等统一权限不兼容。",
solution:
  "复用 0013 迁移规范角色与旧权限，为 dev:api 增加 migration 前置门禁，并通过真实登录、允许/拒绝 API、浏览器刷新恢复及自动化测试回归。",
skip: "",
```

同时新增一条 `events` 完成事件，写明 migration、真实账号、浏览器和质量命令的实际结果。若任何真实集成步骤未执行，则状态保持“进行中”或改为“有风险”，并在 `skip` 中准确记录缺口。

- [ ] **Step 3: 最终检查差异和需求覆盖**

```powershell
git diff --check
git status --short
git diff -- package.json scripts/dev-api-migration.test.mjs apps/api/test/demo-accounts.real.e2e-spec.ts processing_visualization.html
```

Expected: 无空白错误；只包含本任务文件与已识别的用户既有改动；每条验收标准都有测试或运行态证据。

- [ ] **Step 4: 提交缺陷闭环记录**

```powershell
git add -- processing_visualization.html
git commit -m "文档: 完成普通员工路由权限缺陷闭环"
```
