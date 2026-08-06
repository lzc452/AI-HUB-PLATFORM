# AI Hub 阶段 1 基础实施计划

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**Goal:** 建立可在 Windows Docker Compose 中重复启动、在 GitLab CI 中验证、并为后续业务模块提供稳定 interface 的 monorepo 工程基础。

**Architecture:** React/Vite Web、NestJS API 和 NestJS worker 作为三个运行入口，共享 contracts、config、database、server、ui 和 testing package。PostgreSQL 是主数据源，后台可靠任务从事务发件箱开始；所有进程提供结构化日志、追踪 ID 和健康检查。

**Tech Stack:** Node.js >=18.18（Node.js 24 LTS 作为首选 CI/容器基线）、pnpm 10、TypeScript 5.9、React 19.2、React Router 6.30、Vite 6.4、Ant Design 6、Tailwind CSS 4、NestJS 10.4、PostgreSQL 18、Kysely 0.28.2、Zod、Vitest 3.2、Testing Library、Supertest、Docker Compose。

## 全局约束

- 代码必须在 Windows Docker Desktop Linux 容器模式和 Ubuntu Linux 容器中运行。
- 使用 ESM、TypeScript strict mode 和 pnpm workspace。
- 前端使用 Ant Design 默认主题；Tailwind 不加载 Preflight。
- 所有包只能通过 package exports 访问，禁止跨模块深层导入。
- API 与 worker 不包含业务功能，只建立可复用基础。
- PostgreSQL 18 是唯一事务主数据源；不引入 Redis或消息队列。
- 配置缺失必须在进程启动时失败，不能延迟到首个请求。
- 日志不得包含密钥、Cookie、密码或完整连接串。
- 每个任务必须先运行指定失败测试，再实现，再运行全部相关测试。
- 每个任务结束创建独立 Git commit。

---

## 文件结构

```text
.editorconfig
.gitattributes
.gitignore
.gitlab-ci.yml
.npmrc
eslint.config.mjs
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
prettier.config.mjs
tsconfig.base.json
turbo.json
vitest.workspace.ts
compose.yaml
compose.dev.yaml
compose.test.yaml
.env.example
apps/
  api/
    package.json
    tsconfig.json
    src/api.module.ts
    src/main.ts
    test/health.e2e-spec.ts
  web/
    package.json
    tsconfig.json
    vite.config.ts
    src/app/App.tsx
    src/app/App.test.tsx
    src/app/providers.tsx
    src/app/router.tsx
    src/main.tsx
    src/styles.css
  worker/
    package.json
    tsconfig.json
    src/main.ts
    src/worker.module.ts
infra/
  docker/api.Dockerfile
  docker/web.Dockerfile
  docker/worker.Dockerfile
  docker/nginx.conf
  monitoring/prometheus.yml
packages/
  config/
    package.json
    src/index.ts
    src/runtime-config.ts
    src/runtime-config.test.ts
  contracts/
    package.json
    src/index.ts
    src/outbox.ts
    src/problem-details.ts
    src/system/health.ts
  database/
    package.json
    src/database.ts
    src/index.ts
    src/migrate.ts
    src/schema.ts
    src/migrations/0001_system_foundation.ts
    src/outbox/outbox-store.ts
    src/outbox/outbox-store.integration.test.ts
  server/
    package.json
    src/index.ts
    src/system/health/health.controller.ts
    src/system/health/health.module.ts
    src/system/health/health.reader.ts
    src/system/observability/observability.module.ts
    src/system/observability/request-context.middleware.ts
    src/system/outbox/outbox-worker.ts
    src/system/outbox/outbox-worker.test.ts
  testing/
    package.json
    src/index.ts
    src/postgres-test-container.ts
  ui/
    package.json
    src/index.ts
    src/theme.ts
scripts/
  check-workspace.mjs
  check-workspace.test.mjs
  verify.mjs
  verify-doc-links.mjs
docs/
  adr/0001-modular-monolith.md
  adr/0002-postgres-outbox.md
  development/windows-docker-compose.md
```

## 本阶段产出的稳定接口

```ts
export interface RuntimeConfig {
  nodeEnv: 'development' | 'test' | 'production';
  apiPort: number;
  databaseUrl: string;
  cookieSecret: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  outboxPollIntervalMs: number;
}

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  checks: Readonly<Record<string, 'up' | 'down'>>;
  timestamp: string;
}

export interface OutboxEventInput<TPayload = unknown> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  idempotencyKey: string;
}

export interface ClaimedOutboxEvent<TPayload = unknown> {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  idempotencyKey: string;
  attempts: number;
}

export interface OutboxStorePort {
  append(input: OutboxEventInput): Promise<boolean>;
  claim(limit: number, workerId: string): Promise<readonly ClaimedOutboxEvent[]>;
  complete(id: string): Promise<void>;
  fail(id: string, errorCode: string, nextAvailableAt: Date): Promise<void>;
}
```

---

### 任务 1：引导 pnpm workspace 与仓库质量命令

**文件：**
- 创建：`package.json`
- 创建：`pnpm-workspace.yaml`
- 创建：`turbo.json`
- 创建：`tsconfig.base.json`
- 创建：`vitest.workspace.ts`
- 创建：`eslint.config.mjs`
- 创建：`prettier.config.mjs`
- 创建：`.editorconfig`
- 创建：`.gitattributes`
- 创建：`.gitignore`
- 创建：`scripts/check-workspace.mjs`
- 创建：`scripts/check-workspace.test.mjs`

**接口：**
- 消费：Node.js 内置测试运行器。
- 产出：可运行的根命令 `format:check`、`lint`、`typecheck`、`test` 与 `build`。
- 声明保留的根命令名 `boundaries` 与 `verify`；`boundaries` 在任务 7 变为可运行，`verify` 在任务 10 变为可运行。任务 1 中不要创建占位实现。

- [ ] **步骤 1：编写失败的仓库结构测试**

```js
// scripts/check-workspace.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requiredWorkspaceFiles } from './check-workspace.mjs';

test('workspace declares every required root file', async () => {
  const missing = await requiredWorkspaceFiles();
  assert.deepEqual(missing, []);
});
```

```js
// scripts/check-workspace.mjs
import { access } from 'node:fs/promises';

const required = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
  'eslint.config.mjs',
  'prettier.config.mjs',
];

export async function requiredWorkspaceFiles() {
  const checks = await Promise.all(
    required.map(async (path) => {
      try {
        await access(path);
        return null;
      } catch {
        return path;
      }
    }),
  );
  return checks.filter(Boolean);
}
```

- [ ] **步骤 2：运行测试并验证失败**

运行：

```powershell
node --test scripts/check-workspace.test.mjs
```

预期：FAIL，因为根 workspace 文件不存在。

- [ ] **步骤 3：创建根 workspace 清单**

```json
{
  "name": "ai-hub-platform",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=18.18.0"
  },
  "scripts": {
    "build": "turbo run build",
    "boundaries": "dependency-cruiser apps packages --config dependency-cruiser.cjs",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "verify": "node scripts/verify.mjs"
  }
}
```

创建 `pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

创建 `turbo.json`：

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "lint": { "dependsOn": ["^lint"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "typecheck": { "dependsOn": ["^typecheck"], "outputs": [] }
  }
}
```

- [ ] **步骤 4：锁定 pnpm 并安装根工具链**

运行：

```powershell
corepack use pnpm@10.34.5
pnpm add -Dw typescript@~5.9.3 turbo@2.5.8 vitest@3.2.4 jsdom@26.1.0 eslint@9.39.1 typescript-eslint@8.46.0 prettier@3.6.2 dependency-cruiser@16.10.4 @types/node@18.19.130 semver@7.7.4
```

预期：`package.json` 中添加 `packageManager`，并创建 `pnpm-lock.yaml`。

- [ ] **步骤 5：添加严格 TypeScript 与仓库格式规则**

`tsconfig.base.json` 必须包含：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "skipLibCheck": true
  }
}
```

将 `.gitattributes` 设为 `* text=auto eol=lf`，并配置 `.editorconfig` 为 UTF-8、LF、末尾换行、两空格缩进与去除行尾空白。

- [ ] **步骤 6：运行仓库测试与格式检查**

运行：

```powershell
node --test scripts/check-workspace.test.mjs
pnpm format:check
```

预期：PASS。

- [ ] **步骤 7：提交**

```powershell
git add package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json vitest.workspace.ts eslint.config.mjs prettier.config.mjs .editorconfig .gitattributes .gitignore scripts/check-workspace.mjs scripts/check-workspace.test.mjs
git commit -m "chore: bootstrap pnpm workspace"
```

---

### 任务 2：添加共享契约与快速失败的运行时配置

**文件：**
- 创建：`packages/contracts/package.json`
- 创建：`packages/contracts/src/index.ts`
- 创建：`packages/contracts/src/problem-details.ts`
- 创建：`packages/contracts/src/system/health.ts`
- 创建：`packages/config/package.json`
- 创建：`packages/config/src/index.ts`
- 创建：`packages/config/src/runtime-config.ts`
- 创建：`packages/config/src/runtime-config.test.ts`
- 创建：`.env.example`
- 修改：`.gitignore`
- 删除：`.npmrc`
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`
- 修改：`pnpm-workspace.yaml`

**接口：**
- 消费：Zod。
- 产出：`ProblemDetails`、`HealthSnapshot`、`RuntimeConfig`、`parseRuntimeConfig(env)`。

- [ ] **步骤 1：编写失败的配置测试**

```ts
// packages/config/src/runtime-config.test.ts
import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig } from './runtime-config.js';

describe('parseRuntimeConfig', () => {
  it('rejects a missing database URL', () => {
    expect(() =>
      parseRuntimeConfig({
        NODE_ENV: 'test',
        API_PORT: '3000',
        COOKIE_SECRET: '12345678901234567890123456789012',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('normalizes valid values', () => {
    expect(
      parseRuntimeConfig({
        NODE_ENV: 'test',
        API_PORT: '3100',
        DATABASE_URL: 'postgres://ai_hub:ai_hub@postgres:5432/ai_hub',
        COOKIE_SECRET: '12345678901234567890123456789012',
        LOG_LEVEL: 'warn',
        OUTBOX_POLL_INTERVAL_MS: '750',
      }),
    ).toEqual({
      nodeEnv: 'test',
      apiPort: 3100,
      databaseUrl: 'postgres://ai_hub:ai_hub@postgres:5432/ai_hub',
      cookieSecret: '12345678901234567890123456789012',
      logLevel: 'warn',
      outboxPollIntervalMs: 750,
    });
  });
});
```

- [ ] **步骤 2：运行测试并验证模块解析失败**

运行：

```powershell
pnpm --filter @ai-hub/config test
```

预期：FAIL，因为包与 `parseRuntimeConfig` 不存在。

- [ ] **步骤 3：恢复确定性的 Windows 包环境**

Windows 沙箱中默认的用户级 pnpm store 是只读的。pnpm 10 从 `pnpm-workspace.yaml` 读取项目设置；`.npmrc` 保留给镜像源与认证设置。应用经批准的环境修正：

- 在 `pnpm-workspace.yaml` 中添加 `nodeLinker: hoisted` 与 `storeDir: .pnpm-store`。
- 在 `pnpm-workspace.yaml` 中保留 `allowBuilds.esbuild: true`。
- 删除 `.npmrc`；不要把 `engineStrict` 移入 workspace 设置。项目接受 Node 18.18 或更高版本，而 CI 与容器验证继续优先使用阶段 1 锁定的 Node 24 版本。
- 在 `.gitignore` 中添加 `.pnpm-store/`。
- 保持根 `vitest` 开发依赖锁定为 `3.2.4`，这是与 Node 18 基线兼容的最新行。
- 在删除生成的 `node_modules` 目录前，解析其绝对路径并确认它恰好位于此工作树内。
- 不要删除或修改用户级 pnpm store。
- 从清单重新生成 `pnpm-lock.yaml`，并通过项目本地 store 安装。

运行：

```powershell
corepack pnpm install --no-frozen-lockfile
corepack pnpm exec vitest run packages/config/src/runtime-config.test.ts
```

安装前，`corepack pnpm store path` 必须在不使用 CLI `--store-dir` 覆盖的情况下解析到此检出目录内。预期：安装完成且无 `ERR_SQLITE_ERROR`；Vitest 为 `3.2.4` 并执行到测试，测试仅因 `runtime-config.ts` 不存在而失败。之前的 `Unknown method: getBuiltins` 协议错误不得再次出现。

- [ ] **步骤 4：创建契约**

```ts
// packages/contracts/src/problem-details.ts
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  traceId: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}
```

```ts
// packages/contracts/src/system/health.ts
export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  checks: Readonly<Record<string, 'up' | 'down'>>;
  timestamp: string;
}
```

- [ ] **步骤 5：实现快速失败的配置解析**

```ts
// packages/config/src/runtime-config.ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  COOKIE_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
});

export interface RuntimeConfig {
  nodeEnv: 'development' | 'test' | 'production';
  apiPort: number;
  databaseUrl: string;
  cookieSecret: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  outboxPollIntervalMs: number;
}

export function parseRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const value = schema.parse(env);
  return {
    nodeEnv: value.NODE_ENV,
    apiPort: value.API_PORT,
    databaseUrl: value.DATABASE_URL,
    cookieSecret: value.COOKIE_SECRET,
    logLevel: value.LOG_LEVEL,
    outboxPollIntervalMs: value.OUTBOX_POLL_INTERVAL_MS,
  };
}
```

- [ ] **步骤 6：创建包清单与导出**

创建名为 `@ai-hub/contracts` 与 `@ai-hub/config` 的清单。两个包都必须只通过 `exports` 暴露 `./src/index.ts`，包含 `build`、`lint`、`test` 与 `typecheck` 脚本，并继承 workspace 的 TypeScript 设置。从包索引导出每个公共契约；不要暴露深层导入路径。

运行：

```powershell
pnpm --filter @ai-hub/config add zod@^4.1.0
```

- [ ] **步骤 7：运行测试与类型检查**

运行：

```powershell
pnpm --filter @ai-hub/config test
pnpm --filter @ai-hub/config typecheck
pnpm --filter @ai-hub/contracts typecheck
```

预期：PASS。

- [ ] **步骤 8：提交**

```powershell
git add packages/config packages/contracts .env.example pnpm-lock.yaml
git commit -m "feat: add shared contracts and runtime config"
```

---

### 任务 3：建立 PostgreSQL、迁移与 outbox 存储

**文件：**
- 创建：`packages/contracts/src/outbox.ts`
- 修改：`packages/contracts/src/index.ts`
- 创建：`packages/database/package.json`
- 创建：`packages/database/src/database.ts`
- 创建：`packages/database/src/index.ts`
- 创建：`packages/database/src/migrate.ts`
- 创建：`packages/database/src/schema.ts`
- 创建：`packages/database/src/migrations/0001_system_foundation.ts`
- 创建：`packages/database/src/outbox/outbox-store.ts`
- 创建：`packages/database/src/outbox/outbox-store.integration.test.ts`
- 创建：`packages/testing/package.json`
- 创建：`packages/testing/src/index.ts`
- 创建：`packages/testing/src/postgres-test-container.ts`

**接口：**
- 消费：`RuntimeConfig.databaseUrl`。
- 产出：`createDatabase(databaseUrl)`、`runMigrations(db)`、实现 `OutboxStorePort` 的 `OutboxStore`。
- 从 `@ai-hub/contracts` 发布 `OutboxEventInput`、`ClaimedOutboxEvent` 与 `OutboxStorePort`，使用上文声明的完全一致的稳定接口定义。

- [ ] **步骤 1：编写失败的 outbox 集成测试**

```ts
// packages/database/src/outbox/outbox-store.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgresTestContainer } from '@ai-hub/testing';
import { createDatabase, runMigrations } from '../index.js';
import { OutboxStore } from './outbox-store.js';

describe('OutboxStore', () => {
  let stop: () => Promise<void>;
  let store: OutboxStore;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    const db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    store = new OutboxStore(db);
  });

  afterAll(async () => stop());

  it('claims and completes an event only once', async () => {
    await store.append({
      eventType: 'system.probe.requested',
      aggregateType: 'system',
      aggregateId: 'probe',
      payload: { source: 'test' },
      idempotencyKey: 'probe-1',
    });

    const first = await store.claim(10, 'worker-a');
    const second = await store.claim(10, 'worker-b');

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(first[0]?.idempotencyKey).toBe('probe-1');

    await store.complete(first[0]!.id);
    expect(await store.claim(10, 'worker-c')).toHaveLength(0);
  });
});
```

- [ ] **步骤 2：运行测试并验证失败**

运行：

```powershell
pnpm --filter @ai-hub/database test -- outbox-store.integration.test.ts
```

预期：FAIL，因为 database 与 testing 包不存在。

- [ ] **步骤 3：创建包清单并安装数据库工具链**

创建名为 `@ai-hub/database` 与 `@ai-hub/testing` 的清单。两个包都只暴露 `./src/index.ts`，使用通用 `build`、`lint`、`test` 与 `typecheck` 脚本，并通过 `workspace:*` 依赖 workspace 包。

创建 `packages/contracts/src/outbox.ts`，包含确切的阶段稳定 `OutboxEventInput`、`ClaimedOutboxEvent` 与 `OutboxStorePort` 接口，并通过 `packages/contracts/src/index.ts` 导出。`OutboxStore` 必须通过 `@ai-hub/contracts` 包导出导入并实现 `OutboxStorePort`。

运行：

```powershell
pnpm --filter @ai-hub/database add kysely@0.28.2 pg@^8.16.0 @ai-hub/contracts@workspace:*
pnpm --filter @ai-hub/database add -D @types/pg@^8.15.0 @ai-hub/testing@workspace:*
pnpm --filter @ai-hub/testing add testcontainers@10.18.0
```

- [ ] **步骤 4：定义初始 schema**

```ts
// packages/database/src/schema.ts
import type { ColumnType, Generated } from 'kysely';

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  idempotency_key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  available_at: ColumnType<Date, Date | undefined, Date>;
  claimed_by: string | null;
  claimed_at: Date | null;
  last_error: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  completed_at: Date | null;
}

export interface DatabaseSchema {
  outbox_events: OutboxEventsTable;
}
```

- [ ] **步骤 5：创建迁移 `0001_system_foundation`**

迁移必须：

- 启用 `pgcrypto`。
- 创建带 PostgreSQL 生成的 UUID 主键的 `outbox_events`。
- 在 `idempotency_key` 上添加唯一索引。
- 在 `(status, available_at, created_at)` 上添加认领索引。
- 将 `status` 限制为声明的四个值。

表使用 Kysely schema builder，状态检查使用显式 SQL。

- [ ] **步骤 6：实现数据库创建与迁移**

```ts
// packages/database/src/database.ts
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DatabaseSchema } from './schema.js';

export function createDatabase(databaseUrl: string) {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: databaseUrl,
        max: 10,
        connectionTimeoutMillis: 5_000,
      }),
    }),
  });
}
```

- [ ] **步骤 7：实现完整的 outbox 存储**

`OutboxStore.claim` 必须使用一个事务与 `FOR UPDATE SKIP LOCKED`。它必须将所选行改为 `processing`、设置 `claimed_by`、设置 `claimed_at`、递增 `attempts`，并返回已认领记录。

`append` 必须使用 `ON CONFLICT (idempotency_key) DO NOTHING`，使重试业务事务不会产生重复事件。

`complete(id)` 必须只把 `processing` 事件移到 `completed`、设置 `completed_at` 并清除认领字段。

`fail(id, errorCode, nextAvailableAt)` 必须净化 `errorCode`，在 `attempts < 10` 时将事件退回 `pending`、设置用于重试的 `available_at`，并在第 10 次尝试时移到 `failed`。两个迁移都必须拒绝当前不是 `processing` 的 ID。

- [ ] **步骤 8：运行两次集成测试**

运行：

```powershell
pnpm --filter @ai-hub/database test -- outbox-store.integration.test.ts
pnpm --filter @ai-hub/database test -- outbox-store.integration.test.ts
```

预期：两次运行都 PASS，且无泄漏的容器或端口。

- [ ] **步骤 9：提交**

```powershell
git add packages/contracts packages/database packages/testing pnpm-lock.yaml
git commit -m "feat: add postgres migration and outbox foundation"
```

---

### 任务 4：引导 NestJS API 与带健康接口的 worker

**文件：**
- 创建：`apps/api/package.json`
- 创建：`apps/api/tsconfig.json`
- 创建：`apps/api/src/api.module.ts`
- 创建：`apps/api/src/main.ts`
- 创建：`apps/api/test/health.e2e-spec.ts`
- 创建：`apps/worker/package.json`
- 创建：`apps/worker/tsconfig.json`
- 创建：`apps/worker/src/main.ts`
- 创建：`apps/worker/src/worker.module.ts`
- 创建：`packages/server/package.json`
- 创建：`packages/server/src/index.ts`
- 创建：`packages/server/src/system/health/health.controller.ts`
- 创建：`packages/server/src/system/health/health.module.ts`
- 创建：`packages/server/src/system/health/health.reader.ts`

**接口：**
- 消费：`RuntimeConfig`、`createDatabase`。
- 产出：`GET /internal/health/live`、`GET /internal/health/ready`、`HealthReader`。

- [ ] **步骤 1：编写失败的健康端点测试**

```ts
// apps/api/test/health.e2e-spec.ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiModule } from '../src/api.module.js';

describe('health endpoints', () => {
  it('returns liveness without checking dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.forTest({ databaseCheck: async () => true })],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/internal/health/live')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      });

    await app.close();
  });

  it('reports readiness as degraded when postgres is down', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.forTest({ databaseCheck: async () => false })],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/internal/health/ready')
      .expect(503)
      .expect(({ body }) => {
        expect(body.checks.postgres).toBe('down');
      });

    await app.close();
  });
});
```

- [ ] **步骤 2：运行测试并验证失败**

运行：

```powershell
pnpm --filter @ai-hub/api test -- health.e2e-spec.ts
```

预期：FAIL，因为 API 与 server 包不存在。

- [ ] **步骤 3：创建清单并安装 NestJS 依赖**

创建名为 `@ai-hub/api`、`@ai-hub/worker` 与 `@ai-hub/server` 的清单。API 与 worker 是私有应用；server 只导出 `./src/index.ts`。每个清单为其运行时定义确切的 `dev`、`build`、`lint`、`test` 与 `typecheck` 脚本。

运行：

```powershell
pnpm --filter @ai-hub/server add @nestjs/common@10.4.22 reflect-metadata@0.2.2 rxjs@7.8.2 @ai-hub/contracts@workspace:* @ai-hub/database@workspace:*
pnpm --filter @ai-hub/api add @nestjs/common@10.4.22 @nestjs/core@10.4.22 @nestjs/platform-express@10.4.22 reflect-metadata@0.2.2 rxjs@7.8.2 @ai-hub/config@workspace:* @ai-hub/database@workspace:* @ai-hub/server@workspace:*
pnpm --filter @ai-hub/api add -D @nestjs/testing@10.4.22 supertest@7.1.0 @types/supertest@6.0.3
pnpm --filter @ai-hub/worker add @nestjs/common@10.4.22 @nestjs/core@10.4.22 reflect-metadata@0.2.2 rxjs@7.8.2 @ai-hub/config@workspace:* @ai-hub/database@workspace:* @ai-hub/server@workspace:*
```

- [ ] **步骤 4：实现 `HealthReader`**

```ts
export class HealthReader {
  constructor(
    private readonly databaseCheck: () => Promise<boolean>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  live() {
    return {
      status: 'ok' as const,
      checks: {},
      timestamp: this.now().toISOString(),
    };
  }

  async ready() {
    const postgresUp = await this.databaseCheck();
    return {
      status: postgresUp ? ('ok' as const) : ('degraded' as const),
      checks: { postgres: postgresUp ? ('up' as const) : ('down' as const) },
      timestamp: this.now().toISOString(),
    };
  }
}
```

- [ ] **步骤 5：实现控制器与引导**

要求：

- `ApiModule.forTest({ databaseCheck })` 返回一个只替换数据库健康检查提供者的 Nest `DynamicModule`；生产装配绝不导入测试假件。
- 进程事件循环响应时，`/internal/health/live` 始终返回 200。
- `/internal/health/ready` 对 `ok` 返回 200，对 `degraded` 返回 503。
- 生产引导在创建 Nest 应用之前解析配置。
- API 监听 `RuntimeConfig.apiPort`。
- worker 创建应用上下文但不打开 HTTP 端口。
- 两个进程都处理 `SIGTERM` 并优雅关闭。

- [ ] **步骤 6：运行健康与类型测试**

运行：

```powershell
pnpm --filter @ai-hub/api test -- health.e2e-spec.ts
pnpm --filter @ai-hub/api typecheck
pnpm --filter @ai-hub/worker typecheck
```

预期：PASS。

- [ ] **步骤 7：提交**

```powershell
git add apps/api apps/worker packages/server pnpm-lock.yaml
git commit -m "feat: bootstrap api worker and health checks"
```

---

### 任务 5：通过 worker 处理 outbox 事件

**文件：**
- 创建：`packages/server/src/system/outbox/outbox-worker.ts`
- 创建：`packages/server/src/system/outbox/outbox-worker.test.ts`
- 修改：`apps/worker/src/worker.module.ts`
- 修改：`packages/server/src/index.ts`

**接口：**
- 消费：`OutboxStore.claim`、`OutboxStore.complete`、`OutboxStore.fail`。
- 产出：`OutboxHandler`、`OutboxHandlerMap`、`OutboxWorker.runOnce(workerId)`。

```ts
export type OutboxHandler = (event: ClaimedOutboxEvent) => Promise<void>;
export type OutboxHandlerMap = Readonly<Record<string, OutboxHandler>>;
```

- [ ] **步骤 1：编写失败的 worker 测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { OutboxWorker } from './outbox-worker.js';

describe('OutboxWorker', () => {
  it('completes a claimed event after its handler succeeds', async () => {
    const store = {
      claim: vi.fn().mockResolvedValue([
        {
          id: 'event-1',
          eventType: 'system.probe.requested',
          aggregateType: 'system',
          aggregateId: 'probe',
          payload: {},
          idempotencyKey: 'probe-1',
          attempts: 1,
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = new OutboxWorker(store, {
      'system.probe.requested': handler,
    });

    await worker.runOnce('worker-a');

    expect(handler).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith('event-1');
    expect(store.fail).not.toHaveBeenCalled();
  });
});
```

- [ ] **步骤 2：运行测试并验证失败**

运行：

```powershell
pnpm --filter @ai-hub/server test -- outbox-worker.test.ts
```

预期：FAIL，因为 `OutboxWorker` 不存在。

- [ ] **步骤 3：实现单批次处理**

`runOnce` 必须：

- 最多认领 20 个事件。
- 按精确 `eventType` 查找处理器。
- 用代码 `OUTBOX_HANDLER_MISSING` 将未知事件类型标记为失败。
- 完成成功事件。
- 用净化后的错误消息标记失败。
- 绝不因单个事件失败而停止处理批次中其余事件。
- 返回已认领记录数，使轮询循环能区分有工作与空队列。

- [ ] **步骤 4：添加 worker 轮询循环**

worker 入口必须：

- 立即调用 `runOnce`。
- 仅在空批次后等待 `outboxPollIntervalMs`。
- 收到 `SIGTERM` 后停止认领新工作。
- 关闭数据库连接池前完成当前批次。

- [ ] **步骤 5：运行测试**

运行：

```powershell
pnpm --filter @ai-hub/server test -- outbox-worker.test.ts
pnpm --filter @ai-hub/worker typecheck
```

预期：PASS。

- [ ] **步骤 6：提交**

```powershell
git add packages/server/src/system/outbox apps/worker/src/worker.module.ts packages/server/src/index.ts
git commit -m "feat: process transactional outbox events"
```

---

### 任务 6：构建 React 应用外壳与设计系统基线

**文件：**
- 创建：`apps/web/package.json`
- 创建：`apps/web/tsconfig.json`
- 创建：`apps/web/vite.config.ts`
- 创建：`apps/web/src/main.tsx`
- 创建：`apps/web/src/styles.css`
- 创建：`apps/web/src/app/App.tsx`
- 创建：`apps/web/src/app/App.test.tsx`
- 创建：`apps/web/src/app/providers.tsx`
- 创建：`apps/web/src/app/router.tsx`
- 创建：`packages/ui/package.json`
- 创建：`packages/ui/src/index.ts`
- 创建：`packages/ui/src/theme.ts`

**接口：**
- 消费：`HealthSnapshot`。
- 产出：`AppProviders`、`AppRouter`、Ant Design 主题配置。

- [ ] **步骤 1：编写失败的应用外壳测试**

```tsx
// apps/web/src/app/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders accessible primary navigation', () => {
    render(<App />);

    expect(
      screen.getByRole('navigation', { name: '主导航' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '应用市场' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '创新广场' })).toBeInTheDocument();
  });
});
```

- [ ] **步骤 2：运行测试并验证失败**

运行：

```powershell
pnpm --filter @ai-hub/web test -- App.test.tsx
```

预期：FAIL，因为 web 包不存在。

- [ ] **步骤 3：创建清单并安装 Web 技术栈**

创建 `apps/web/package.json`，名称为 `@ai-hub/web`，`private: true`，包含 `dev`、`build`、`lint`、`test` 与 `typecheck` 脚本。创建 `packages/ui/package.json`，名称为 `@ai-hub/ui`，单一根导出、相同的质量脚本，并将 `antd: ^6.5.0` 作为 peer 依赖。

运行：

```powershell
pnpm --filter @ai-hub/web add react@^19.2.0 react-dom@^19.2.0 react-router-dom@6.30.4 antd@^6.5.0 @ant-design/icons@^6.1.0 @tanstack/react-query@^5.90.0 @ai-hub/contracts@workspace:* @ai-hub/ui@workspace:*
pnpm --filter @ai-hub/web add -D vite@6.4.3 @vitejs/plugin-react@^4.7.0 tailwindcss@4.1.18 @tailwindcss/vite@4.1.18 vitest@3.2.4 @testing-library/react@^16.3.0 @testing-library/jest-dom@6.9.1 jsdom@26.1.0
pnpm --filter @ai-hub/ui add -D antd@^6.5.0
```

- [ ] **步骤 4：配置不使用 Preflight 的 Tailwind**

`apps/web/src/styles.css`：

```css
@layer theme, antd, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);

:root {
  font-family:
    Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  color: #1f1f1f;
  background: #f5f5f5;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

不要导入 `tailwindcss/preflight.css` 或 Ant Design `reset.css`。

- [ ] **步骤 5：创建主题与提供者**

```ts
// packages/ui/src/theme.ts
import type { ThemeConfig } from 'antd';

export const aiHubTheme: ThemeConfig = {
  cssVar: true,
  token: {
    borderRadius: 6,
    motionDurationFast: '0.15s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
  },
};
```

`AppProviders` 必须用 `zhCN`、`aiHubTheme` 与一个 `QueryClient` 配置 `ConfigProvider`。不要自定义 Ant Design 默认主色。

- [ ] **步骤 6：实现外壳**

初始外壳必须包含：

- 跳到 `#main-content` 的跳过链接。
- 名为 `主导航` 的导航地标。
- 应用市场与创新广场的链接。
- 静态的功能状态页，说明功能正在构建中，不添加业务行为。
- 使用 Tailwind 布局工具类的响应式 Ant Design `Layout`。
- 无渐变样式或装饰性连续动画。

- [ ] **步骤 7：运行 UI 测试与构建**

运行：

```powershell
pnpm --filter @ai-hub/web test -- App.test.tsx
pnpm --filter @ai-hub/web typecheck
pnpm --filter @ai-hub/web build
```

预期：PASS。

- [ ] **步骤 8：提交**

```powershell
git add apps/web packages/ui pnpm-lock.yaml
git commit -m "feat: add React application shell"
```

---

### 任务 7：强制模块与包边界

**文件：**
- 创建：`dependency-cruiser.cjs`
- 创建：`packages/server/src/architecture-boundaries.fixture.ts`
- 修改：`package.json`
- 修改：`apps/api/package.json`
- 修改：`apps/web/package.json`
- 修改：`apps/worker/package.json`
- 修改：`packages/config/package.json`
- 修改：`packages/contracts/package.json`
- 修改：`packages/database/package.json`
- 修改：`packages/server/package.json`
- 修改：`packages/testing/package.json`
- 修改：`packages/ui/package.json`

**接口：**
- 消费：包导出与目录归属。
- 产出：`pnpm boundaries`。

- [ ] **步骤 1：添加一个刻意的失败依赖规则**

在 `packages/server/src/architecture-boundaries.fixture.ts` 中创建临时导入：

```ts
import '../../../apps/api/src/api.module.js';

export const invalidDependency = true;
```

- [ ] **步骤 2：创建边界规则**

`dependency-cruiser.cjs` 必须禁止：

- 循环依赖。
- 除通过包导出外的 `packages/*/src/**` 导入。
- `packages/server/src/**/domain/**` 导入 NestJS、Kysely、`pg`、HTTP 或外部 SDK 包。
- `packages/server` 导入 `apps/*`。
- `apps/web/src/modules/*` 中的模块深层导入另一个功能模块。

- [ ] **步骤 3：运行边界检查并验证失败**

运行：

```powershell
pnpm boundaries
```

预期：FAIL，并指出从 `packages/server` 到 `apps/api` 的导入。

- [ ] **步骤 4：移除刻意违规**

删除 `packages/server/src/architecture-boundaries.fixture.ts`。

- [ ] **步骤 5：运行边界检查**

运行：

```powershell
pnpm boundaries
```

预期：PASS，零违规。

- [ ] **步骤 6：提交**

```powershell
git add dependency-cruiser.cjs package.json apps packages
git commit -m "chore: enforce module boundaries"
```

---

### 任务 8：添加 Windows 开发与隔离测试 Compose 环境

**文件：**
- 创建：`.dockerignore`
- 创建：`compose.yaml`
- 创建：`compose.dev.yaml`
- 创建：`compose.test.yaml`
- 修改：`.env.example`
- 修改：`.gitignore`
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`
- 创建：`tsconfig.runtime.json`
- 修改：`apps/api/package.json`
- 修改：`apps/worker/package.json`
- 修改：`packages/testing/src/postgres-test-container.ts`
- 创建：`packages/testing/test/postgres-test-container.test.ts`
- 修改：`packages/testing/package.json`
- 创建：`infra/docker/api.Dockerfile`
- 创建：`infra/docker/web.Dockerfile`
- 创建：`infra/docker/worker.Dockerfile`
- 创建：`infra/docker/nginx.conf`
- 创建：`infra/docker/web.nginx.conf`
- 创建：`infra/garage/garage.toml`
- 创建：`docs/adr/0003-garage-object-storage.md`
- 创建：`docs/development/windows-docker-compose.md`
- 创建：`scripts/migrate.mts`

**接口：**
- 消费：API、worker、web、PostgreSQL、Garage、ClamAV。
- 产出：`docker compose -f compose.yaml -f compose.dev.yaml up`。

- [ ] **步骤 1：编写一个无效的 Compose 引用**

创建 `compose.dev.yaml`，临时依赖 `missing-service`。

- [ ] **步骤 2：运行 Compose 校验并验证失败**

运行：

```powershell
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
```

预期：FAIL，因为 `missing-service` 未定义。

- [ ] **步骤 3：实现基础环境**

`compose.yaml` 必须定义：

- 使用 `postgres:18.4-bookworm` 的 `postgres`。
- 使用 ADR 0003 接受的 `dxflrs/garage:v2.3.0` 的 `garage`。
- 使用 `clamav/clamav:1.4.5-debian` 的 `clamav`。
- `api`、`worker`、`web` 与 `proxy`。
- 数据库、对象存储与病毒定义的命名卷。
- 所有依赖容器的健康检查。
- 一个内部应用网络。
- 无生产密钥。

编写 Compose 文件前，运行：

```powershell
docker manifest inspect dxflrs/garage:v2.3.0
docker manifest inspect clamav/clamav:1.4.5-debian
```

预期：两个替代镜像清单都能解析。原始 MinIO 清单以 `no such manifest` 失败；ADR 0003 记录了所需的替代决策。如果任一替代镜像不可用，请在实施前停下并修订 ADR。不要静默替换为 `latest`。

- [ ] **步骤 4：实现开发覆盖**

`compose.dev.yaml` 必须：

- 为热重载绑定源码目录。
- 只在 `127.0.0.1:8080` 暴露代理。
- 只在 `127.0.0.1` 暴露 PostgreSQL 与 Garage S3/admin 端口。
- 使用来自 `.env` 的开发凭据。
- 启动 Vite、Nest watch 模式与 worker watch 模式。
- 移除临时的 `missing-service`。

- [ ] **步骤 5：实现测试覆盖**

`compose.test.yaml` 必须：

- 使用不同的 Compose 项目名。
- 使用隔离卷。
- 禁用真实的外部网络集成。
- 启动依赖、执行 `pnpm verify` 并退出。
- 通过文档化的清理命令移除测试容器与卷。

- [ ] **步骤 6：验证两个环境**

运行：

```powershell
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
docker compose -f compose.yaml -f compose.test.yaml config --quiet
```

预期：PASS。

- [ ] **步骤 7：启动开发环境并检查健康**

运行：

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
docker compose -f compose.yaml -f compose.dev.yaml ps
Invoke-RestMethod http://127.0.0.1:8080/internal/health/ready
```

预期：每个容器都健康，就绪检查返回 `status: ok`。

- [ ] **步骤 8：记录 Windows 设置**

文档必须包含：

- Docker Desktop Linux 容器要求。
- 必需端口。
- 首次启动。
- 迁移命令。
- 测试命令。
- 带明确警告的数据重置命令。
- 日志检查。
- 干净关闭。

- [ ] **步骤 9：提交**

```powershell
git add compose.yaml compose.dev.yaml compose.test.yaml .env.example infra/docker docs/development
git commit -m "chore: add Windows Docker Compose environments"
```

---

### 任务 9：添加结构化日志、追踪 ID、指标与 HTTP 错误

**文件：**
- 创建：`packages/server/src/system/observability/observability.module.ts`
- 创建：`packages/server/src/system/observability/request-context.middleware.ts`
- 创建：`packages/server/src/system/observability/request-context.middleware.test.ts`
- 创建：`packages/server/src/system/http/problem-details.filter.ts`
- 创建：`packages/server/src/system/http/problem-details.filter.test.ts`
- 创建：`infra/monitoring/prometheus.yml`
- 修改：`apps/api/src/api.module.ts`
- 修改：`apps/api/src/main.ts`
- 修改：`apps/worker/src/main.ts`
- 修改：`compose.yaml`

**接口：**
- 消费：有效的入站 `x-request-id`。
- 产出：响应 `x-request-id`、JSON 日志、`ProblemDetails`、`/internal/metrics`。

- [ ] **步骤 1：编写失败的追踪 ID 与 HTTP 错误测试**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeTraceId } from './request-context.middleware.js';

describe('normalizeTraceId', () => {
  it('keeps a valid caller trace id', () => {
    expect(normalizeTraceId('01JZ3M8V9Z3V4F2V3K0R4Y8P6S')).toBe(
      '01JZ3M8V9Z3V4F2V3K0R4Y8P6S',
    );
  });

  it('replaces an unsafe value', () => {
    expect(normalizeTraceId('bad value\r\n')).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { toProblemDetails } from './problem-details.filter.js';

describe('toProblemDetails', () => {
  it('hides internal error details from the caller', () => {
    expect(
      toProblemDetails(
        new Error('connect postgres://user:secret@postgres:5432/ai_hub'),
        '01JZ3M8V9Z3V4F2V3K0R4Y8P6S',
      ),
    ).toEqual({
      type: 'about:blank',
      title: '服务器内部错误',
      status: 500,
      code: 'INTERNAL_ERROR',
      traceId: '01JZ3M8V9Z3V4F2V3K0R4Y8P6S',
    });
  });
});
```

- [ ] **步骤 2：运行测试并验证失败**

运行：

```powershell
pnpm --filter @ai-hub/server test -- request-context.middleware.test.ts
pnpm --filter @ai-hub/server test -- problem-details.filter.test.ts
```

预期：FAIL，因为可观测性模块不存在。

- [ ] **步骤 3：安装可观测性依赖**

运行：

```powershell
pnpm --filter @ai-hub/server add pino@^9.5.0 pino-http@^10.3.0 prom-client@^15.1.3 ulid@^3.0.1
```

- [ ] **步骤 4：实现请求上下文与 HTTP 错误过滤器**

要求：

- `x-request-id` 只接受 26 字符的 ULID。
- 为缺失或无效的值生成 ULID。
- 在响应头中返回追踪 ID。
- 将追踪 ID 加入请求级日志与 `ProblemDetails`。
- 脱敏 authorization、Cookie、set-cookie、password、secret、token 与数据库 URL 字段。
- 将 Nest HTTP 异常、Zod 校验错误与未知错误转换为共享的 `ProblemDetails` 结构。
- 绝不向调用方暴露堆栈、SQL、连接串、文件系统路径或第三方原始错误体。
- 用相同追踪 ID 在 `error` 级别记录未知错误；返回代码 `INTERNAL_ERROR`。

- [ ] **步骤 5：添加指标**

暴露以下 Prometheus 指标：

- 进程健康。
- HTTP 耗时与状态。
- 活动请求数。
- 数据库就绪状态。
- outbox 待处理、处理中与失败计数。
- worker 处理器耗时与失败数。

指标端点必须只绑定到内部代理路径，且不得从用户界面链接。

- [ ] **步骤 6：运行测试并检查日志**

运行：

```powershell
pnpm --filter @ai-hub/server test
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
Invoke-WebRequest http://127.0.0.1:8080/internal/health/live -Headers @{ 'x-request-id' = '01JZ3M8V9Z3V4F2V3K0R4Y8P6S' }
docker compose -f compose.yaml -f compose.dev.yaml logs api
```

预期：响应与 JSON 日志共享所提供的追踪 ID，且不含任何凭据。

- [ ] **步骤 7：提交**

```powershell
git add packages/server/src/system/observability packages/server/src/system/http apps/api apps/worker infra/monitoring compose.yaml pnpm-lock.yaml
git commit -m "feat: add observability foundation"
```

---

### 任务 10：添加本地验证流水线与 GitLab CI

**文件：**
- 创建：`scripts/verify.mjs`
- 创建：`scripts/verify-doc-links.mjs`
- 创建：`.gitlab-ci.yml`
- 创建：`docs/adr/0001-modular-monolith.md`
- 创建：`docs/adr/0002-postgres-outbox.md`
- 修改：`package.json`
- 修改：`README.md`

**接口：**
- 消费：所有根质量命令。
- 产出：`pnpm verify`、GitLab `verify` 与 `container-smoke` 任务。

- [ ] **步骤 1：编写失败的文档链接检查**

```js
// scripts/verify-doc-links.mjs
import { access, readFile } from 'node:fs/promises';

const readme = await readFile('README.md', 'utf8');
const links = [...readme.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
const failures = [];

for (const link of links) {
  try {
    await access(link);
  } catch {
    failures.push(link);
  }
}

if (failures.length > 0) {
  throw new Error(`Broken Markdown links: ${failures.join(', ')}`);
}
```

在 README 中添加一个指向 `docs/development/missing.md` 的链接。

- [ ] **步骤 2：运行检查并验证失败**

运行：

```powershell
node scripts/verify-doc-links.mjs
```

预期：FAIL，指出 `docs/development/missing.md`。

- [ ] **步骤 3：用真实项目文档替换坏链接**

README 必须链接到：

- 已批准的设计规格。
- 项目路线图。
- 阶段 1 计划。
- Windows Compose 指南。
- 两份 ADR。

ADR 0001 记录 React SPA + NestJS 模块化单体，并否决 Next.js 全栈与微服务。

ADR 0002 记录 PostgreSQL 事务性 outbox，并否决在 V1 中引入 Redis/消息队列。

- [ ] **步骤 4：实现验证运行器**

`scripts/verify.mjs` 必须顺序运行并在首个失败处停止：

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm boundaries`
5. `pnpm test`
6. `pnpm build`
7. `node scripts/verify-doc-links.mjs`
8. `docker compose -f compose.yaml -f compose.test.yaml config --quiet`

使用带 `shell: true` 的 `spawnSync`，继承 stdio，并返回失败命令的退出码。

- [ ] **步骤 5：创建 GitLab CI**

`.gitlab-ci.yml` 必须：

- 使用 Node 24。
- 启用 Corepack 并安装锁定的 pnpm 版本。
- 缓存 pnpm store，而不是 `node_modules`。
- 运行 `pnpm install --frozen-lockfile`。
- 运行 `pnpm verify`。
- 仅在验证通过后构建 API、worker 与 Web 镜像。
- 运行 `docker compose ... config --quiet`。
- 将测试报告与覆盖率保留为制品。
- 取消同一分支上被取代的流水线。

- [ ] **步骤 6：运行完整本地门禁**

运行：

```powershell
pnpm install --frozen-lockfile
pnpm verify
```

预期：PASS。

- [ ] **步骤 7：运行干净的 Compose 冒烟测试**

运行：

```powershell
docker compose -f compose.yaml -f compose.test.yaml down -v
docker compose -f compose.yaml -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test
docker compose -f compose.yaml -f compose.test.yaml down -v
```

预期：测试容器退出码为 0，清理移除隔离卷。

- [ ] **步骤 8：提交**

```powershell
git add scripts/verify.mjs scripts/verify-doc-links.mjs .gitlab-ci.yml docs/adr README.md package.json
git commit -m "ci: add reproducible verification pipeline"
```

---

## 阶段 1 完成检查

- [ ] 运行 `pnpm verify`。
- [ ] 运行干净的 Compose 冒烟测试。
- [ ] 从干净卷启动开发环境。
- [ ] 验证 Web 在 `http://127.0.0.1:8080` 加载。
- [ ] 验证 API 存活与就绪。
- [ ] 停止 PostgreSQL 并验证就绪返回 503。
- [ ] 重启 PostgreSQL 并验证就绪恢复。
- [ ] 追加一条探针 outbox 事件并验证 worker 恰好处理一次。
- [ ] 检查日志并确认追踪 ID 与脱敏。
- [ ] 确认 `git status --short` 为空。
- [ ] 在阶段 1 完成说明中记录解析后的确切依赖与镜像版本。

预期最终证据：

```text
pnpm verify                                      PASS
docker compose test stack                       PASS
GET /internal/health/live                       200
GET /internal/health/ready with postgres up      200
GET /internal/health/ready with postgres down    503
outbox probe handled count                       1
module boundary violations                       0
working tree                                     clean
```
