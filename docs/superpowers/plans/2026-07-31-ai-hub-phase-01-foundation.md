# AI Hub Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可在 Windows Docker Compose 中重复启动、在 GitLab CI 中验证、并为后续业务模块提供稳定 interface 的 monorepo 工程基础。

**Architecture:** React/Vite Web、NestJS API 和 NestJS worker 作为三个运行入口，共享 contracts、config、database、server、ui 和 testing package。PostgreSQL 是主数据源，后台可靠任务从事务发件箱开始；所有进程提供结构化日志、追踪 ID 和健康检查。

**Tech Stack:** Node.js >=18.18（Node.js 24 LTS 作为首选 CI/容器基线）、pnpm 10、TypeScript 5.9、React 19.2、React Router 6.30、Vite 6.4、Ant Design 6、Tailwind CSS 4、NestJS 10.4、PostgreSQL 18、Kysely 0.28.2、Zod、Vitest 3.2、Testing Library、Supertest、Docker Compose。

## Global Constraints

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

## File Structure

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

## Stable Interfaces Produced by This Phase

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

### Task 1: Bootstrap the pnpm workspace and repository quality commands

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `.editorconfig`
- Create: `.gitattributes`
- Create: `.gitignore`
- Create: `scripts/check-workspace.mjs`
- Create: `scripts/check-workspace.test.mjs`

**Interfaces:**
- Consumes: Node.js built-in test runner.
- Produces: runnable root commands `format:check`, `lint`, `typecheck`, `test`, and `build`.
- Declares reserved root command names `boundaries` and `verify`; `boundaries` becomes runnable in Task 7 and `verify` becomes runnable in Task 10. Do not create placeholder implementations in Task 1.

- [ ] **Step 1: Write the failing repository-structure test**

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

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --test scripts/check-workspace.test.mjs
```

Expected: FAIL because the root workspace files do not exist.

- [ ] **Step 3: Create the root workspace manifest**

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

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `turbo.json`:

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

- [ ] **Step 4: Pin pnpm and install root tooling**

Run:

```powershell
corepack use pnpm@10.34.5
pnpm add -Dw typescript@~5.9.3 turbo@2.5.8 vitest@3.2.4 jsdom@26.1.0 eslint@9.39.1 typescript-eslint@8.46.0 prettier@3.6.2 dependency-cruiser@16.10.4 @types/node@18.19.130 semver@7.7.4
```

Expected: `packageManager` is added to `package.json` and `pnpm-lock.yaml` is created.

- [ ] **Step 5: Add strict TypeScript and repository formatting rules**

`tsconfig.base.json` must include:

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

Set `.gitattributes` to `* text=auto eol=lf` and configure `.editorconfig` for UTF-8, LF, final newline, two-space indentation, and trailing whitespace removal.

- [ ] **Step 6: Run the repository test and formatting check**

Run:

```powershell
node --test scripts/check-workspace.test.mjs
pnpm format:check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json vitest.workspace.ts eslint.config.mjs prettier.config.mjs .editorconfig .gitattributes .gitignore scripts/check-workspace.mjs scripts/check-workspace.test.mjs
git commit -m "chore: bootstrap pnpm workspace"
```

---

### Task 2: Add shared contracts and fail-fast runtime configuration

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/problem-details.ts`
- Create: `packages/contracts/src/system/health.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/runtime-config.ts`
- Create: `packages/config/src/runtime-config.test.ts`
- Create: `.env.example`
- Modify: `.gitignore`
- Delete: `.npmrc`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: Zod.
- Produces: `ProblemDetails`, `HealthSnapshot`, `RuntimeConfig`, `parseRuntimeConfig(env)`.

- [ ] **Step 1: Write failing configuration tests**

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

- [ ] **Step 2: Run the test and verify module resolution fails**

Run:

```powershell
pnpm --filter @ai-hub/config test
```

Expected: FAIL because the package and `parseRuntimeConfig` do not exist.

- [ ] **Step 3: Restore a deterministic Windows package environment**

The default user-level pnpm store is read-only in the Windows sandbox. pnpm 10 reads project settings from `pnpm-workspace.yaml`; `.npmrc` is reserved for registry and authentication settings. Apply the approved environment correction:

- Add `nodeLinker: hoisted` and `storeDir: .pnpm-store` to `pnpm-workspace.yaml`.
- Keep `allowBuilds.esbuild: true` in `pnpm-workspace.yaml`.
- Delete `.npmrc`; do not move `engineStrict` into workspace settings. The project accepts Node 18.18 or newer, while CI and container verification continue to prefer the pinned Phase 1 Node 24 version.
- Add `.pnpm-store/` to `.gitignore`.
- Keep the root `vitest` dev dependency pinned to `3.2.4`, the latest compatible line for the Node 18 baseline.
- Resolve the absolute `node_modules` path and verify it is exactly inside this worktree before removing that generated directory.
- Do not remove or modify the user-level pnpm store.
- Regenerate `pnpm-lock.yaml` from the manifests and install through the project-local store.

Run:

```powershell
corepack pnpm install --no-frozen-lockfile
corepack pnpm exec vitest run packages/config/src/runtime-config.test.ts
```

Before installation, `corepack pnpm store path` must resolve inside this checkout without a CLI `--store-dir` override. Expected: installation completes without `ERR_SQLITE_ERROR`; Vitest is `3.2.4` and reaches the test, which fails only because `runtime-config.ts` does not exist. The previous `Unknown method: getBuiltins` protocol error must not recur.

- [ ] **Step 4: Create the contracts**

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

- [ ] **Step 5: Implement fail-fast configuration parsing**

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

- [ ] **Step 6: Create package manifests and exports**

Create manifests named `@ai-hub/contracts` and `@ai-hub/config`. Both packages must expose only `./src/index.ts` through `exports`, include `build`, `lint`, `test`, and `typecheck` scripts, and extend the workspace TypeScript settings. Export every public contract from the package index; do not expose deep import paths.

Run:

```powershell
pnpm --filter @ai-hub/config add zod@^4.1.0
```

- [ ] **Step 7: Run tests and type checking**

Run:

```powershell
pnpm --filter @ai-hub/config test
pnpm --filter @ai-hub/config typecheck
pnpm --filter @ai-hub/contracts typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add packages/config packages/contracts .env.example pnpm-lock.yaml
git commit -m "feat: add shared contracts and runtime config"
```

---

### Task 3: Establish PostgreSQL, migrations, and the outbox store

**Files:**
- Create: `packages/contracts/src/outbox.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/database/package.json`
- Create: `packages/database/src/database.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/src/migrate.ts`
- Create: `packages/database/src/schema.ts`
- Create: `packages/database/src/migrations/0001_system_foundation.ts`
- Create: `packages/database/src/outbox/outbox-store.ts`
- Create: `packages/database/src/outbox/outbox-store.integration.test.ts`
- Create: `packages/testing/package.json`
- Create: `packages/testing/src/index.ts`
- Create: `packages/testing/src/postgres-test-container.ts`

**Interfaces:**
- Consumes: `RuntimeConfig.databaseUrl`.
- Produces: `createDatabase(databaseUrl)`, `runMigrations(db)`, `OutboxStore` implementing `OutboxStorePort`.
- Publishes `OutboxEventInput`, `ClaimedOutboxEvent`, and `OutboxStorePort` from `@ai-hub/contracts`, using the exact stable interface definitions declared above.

- [ ] **Step 1: Write a failing outbox integration test**

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

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --filter @ai-hub/database test -- outbox-store.integration.test.ts
```

Expected: FAIL because database and testing packages do not exist.

- [ ] **Step 3: Create package manifests and install database tooling**

Create manifests named `@ai-hub/database` and `@ai-hub/testing`. Both packages expose only `./src/index.ts`, use the common `build`, `lint`, `test`, and `typecheck` scripts, and depend on workspace packages through `workspace:*`.

Create `packages/contracts/src/outbox.ts` with the exact phase-stable `OutboxEventInput`, `ClaimedOutboxEvent`, and `OutboxStorePort` interfaces, and export them through `packages/contracts/src/index.ts`. `OutboxStore` must import and implement `OutboxStorePort` through the `@ai-hub/contracts` package export.

Run:

```powershell
pnpm --filter @ai-hub/database add kysely@0.28.2 pg@^8.16.0 @ai-hub/contracts@workspace:*
pnpm --filter @ai-hub/database add -D @types/pg@^8.15.0 @ai-hub/testing@workspace:*
pnpm --filter @ai-hub/testing add testcontainers@10.18.0
```

- [ ] **Step 4: Define the initial schema**

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

- [ ] **Step 5: Create migration `0001_system_foundation`**

The migration must:

- Enable `pgcrypto`.
- Create `outbox_events` with UUID primary key generated by PostgreSQL.
- Add a unique index on `idempotency_key`.
- Add a claim index on `(status, available_at, created_at)`.
- Restrict `status` to the four declared values.

Use Kysely schema builder for tables and explicit SQL for the status check.

- [ ] **Step 6: Implement database creation and migration**

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

- [ ] **Step 7: Implement the complete outbox store**

`OutboxStore.claim` must use one transaction and `FOR UPDATE SKIP LOCKED`. It must change selected rows to `processing`, set `claimed_by`, set `claimed_at`, increment `attempts`, and return the claimed records.

`append` must use `ON CONFLICT (idempotency_key) DO NOTHING` so retrying a business transaction cannot duplicate an event.

`complete(id)` must move only a `processing` event to `completed`, set `completed_at`, and clear claim fields.

`fail(id, errorCode, nextAvailableAt)` must sanitize `errorCode`, return the event to `pending` while `attempts < 10`, set `available_at` for retry, and move it to `failed` at attempt 10. Both transitions must reject an ID that is not currently `processing`.

- [ ] **Step 8: Run integration tests twice**

Run:

```powershell
pnpm --filter @ai-hub/database test -- outbox-store.integration.test.ts
pnpm --filter @ai-hub/database test -- outbox-store.integration.test.ts
```

Expected: both runs PASS without leaked containers or ports.

- [ ] **Step 9: Commit**

```powershell
git add packages/contracts packages/database packages/testing pnpm-lock.yaml
git commit -m "feat: add postgres migration and outbox foundation"
```

---

### Task 4: Bootstrap NestJS API and worker with health interfaces

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/api.module.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/test/health.e2e-spec.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/main.ts`
- Create: `apps/worker/src/worker.module.ts`
- Create: `packages/server/package.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/system/health/health.controller.ts`
- Create: `packages/server/src/system/health/health.module.ts`
- Create: `packages/server/src/system/health/health.reader.ts`

**Interfaces:**
- Consumes: `RuntimeConfig`, `createDatabase`.
- Produces: `GET /internal/health/live`, `GET /internal/health/ready`, `HealthReader`.

- [ ] **Step 1: Write failing health endpoint tests**

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

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --filter @ai-hub/api test -- health.e2e-spec.ts
```

Expected: FAIL because API and server packages do not exist.

- [ ] **Step 3: Create manifests and install NestJS dependencies**

Create manifests named `@ai-hub/api`, `@ai-hub/worker`, and `@ai-hub/server`. API and worker are private applications; server exports only `./src/index.ts`. Each manifest defines exact `dev`, `build`, `lint`, `test`, and `typecheck` scripts for its runtime.

Run:

```powershell
pnpm --filter @ai-hub/server add @nestjs/common@10.4.22 reflect-metadata@0.2.2 rxjs@7.8.2 @ai-hub/contracts@workspace:* @ai-hub/database@workspace:*
pnpm --filter @ai-hub/api add @nestjs/common@10.4.22 @nestjs/core@10.4.22 @nestjs/platform-express@10.4.22 reflect-metadata@0.2.2 rxjs@7.8.2 @ai-hub/config@workspace:* @ai-hub/database@workspace:* @ai-hub/server@workspace:*
pnpm --filter @ai-hub/api add -D @nestjs/testing@10.4.22 supertest@7.1.0 @types/supertest@6.0.3
pnpm --filter @ai-hub/worker add @nestjs/common@10.4.22 @nestjs/core@10.4.22 reflect-metadata@0.2.2 rxjs@7.8.2 @ai-hub/config@workspace:* @ai-hub/database@workspace:* @ai-hub/server@workspace:*
```

- [ ] **Step 4: Implement `HealthReader`**

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

- [ ] **Step 5: Implement controllers and bootstrap**

Requirements:

- `ApiModule.forTest({ databaseCheck })` returns a Nest `DynamicModule` that replaces only the database health-check provider; production wiring never imports a test fake.
- `/internal/health/live` always returns 200 while the process event loop is responsive.
- `/internal/health/ready` returns 200 for `ok` and 503 for `degraded`.
- Production bootstrap parses configuration before creating the Nest application.
- API listens on `RuntimeConfig.apiPort`.
- Worker creates an application context without opening an HTTP port.
- Both processes handle `SIGTERM` with graceful shutdown.

- [ ] **Step 6: Run health and type tests**

Run:

```powershell
pnpm --filter @ai-hub/api test -- health.e2e-spec.ts
pnpm --filter @ai-hub/api typecheck
pnpm --filter @ai-hub/worker typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api apps/worker packages/server pnpm-lock.yaml
git commit -m "feat: bootstrap api worker and health checks"
```

---

### Task 5: Run outbox events through the worker

**Files:**
- Create: `packages/server/src/system/outbox/outbox-worker.ts`
- Create: `packages/server/src/system/outbox/outbox-worker.test.ts`
- Modify: `apps/worker/src/worker.module.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `OutboxStore.claim`, `OutboxStore.complete`, `OutboxStore.fail`.
- Produces: `OutboxHandler`, `OutboxHandlerMap`, `OutboxWorker.runOnce(workerId)`.

```ts
export type OutboxHandler = (event: ClaimedOutboxEvent) => Promise<void>;
export type OutboxHandlerMap = Readonly<Record<string, OutboxHandler>>;
```

- [ ] **Step 1: Write the failing worker test**

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

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --filter @ai-hub/server test -- outbox-worker.test.ts
```

Expected: FAIL because `OutboxWorker` does not exist.

- [ ] **Step 3: Implement one-batch processing**

`runOnce` must:

- Claim at most 20 events.
- Look up a handler by exact `eventType`.
- Mark unknown event types failed with code `OUTBOX_HANDLER_MISSING`.
- Complete successful events.
- Mark failures with a sanitized error message.
- Never stop processing the remaining batch because one event fails.
- Return the number of claimed records so the polling loop can distinguish work from an empty queue.

- [ ] **Step 4: Add the worker polling loop**

The worker entrypoint must:

- Call `runOnce` immediately.
- Wait `outboxPollIntervalMs` only after an empty batch.
- Stop claiming new work after `SIGTERM`.
- Finish the current batch before closing the database pool.

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @ai-hub/server test -- outbox-worker.test.ts
pnpm --filter @ai-hub/worker typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/server/src/system/outbox apps/worker/src/worker.module.ts packages/server/src/index.ts
git commit -m "feat: process transactional outbox events"
```

---

### Task 6: Build the React application shell and design-system baseline

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/src/app/App.test.tsx`
- Create: `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `packages/ui/package.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/theme.ts`

**Interfaces:**
- Consumes: `HealthSnapshot`.
- Produces: `AppProviders`, `AppRouter`, Ant Design theme configuration.

- [ ] **Step 1: Write the failing application-shell test**

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

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --filter @ai-hub/web test -- App.test.tsx
```

Expected: FAIL because the web package does not exist.

- [ ] **Step 3: Create manifests and install the Web stack**

Create `apps/web/package.json` with name `@ai-hub/web`, `private: true`, and `dev`, `build`, `lint`, `test`, and `typecheck` scripts. Create `packages/ui/package.json` with name `@ai-hub/ui`, a single root export, the same quality scripts, and `antd: ^6.5.0` as a peer dependency.

Run:

```powershell
pnpm --filter @ai-hub/web add react@^19.2.0 react-dom@^19.2.0 react-router-dom@6.30.4 antd@^6.5.0 @ant-design/icons@^6.1.0 @tanstack/react-query@^5.90.0 @ai-hub/contracts@workspace:* @ai-hub/ui@workspace:*
pnpm --filter @ai-hub/web add -D vite@6.4.3 @vitejs/plugin-react@^4.7.0 tailwindcss@4.1.18 @tailwindcss/vite@4.1.18 vitest@3.2.4 @testing-library/react@^16.3.0 @testing-library/jest-dom@6.9.1 jsdom@26.1.0
pnpm --filter @ai-hub/ui add -D antd@^6.5.0
```

- [ ] **Step 4: Configure Tailwind without Preflight**

`apps/web/src/styles.css`:

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

Do not import `tailwindcss/preflight.css` or Ant Design `reset.css`.

- [ ] **Step 5: Create the theme and providers**

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

`AppProviders` must configure `ConfigProvider` with `zhCN`, `aiHubTheme`, and one `QueryClient`. Do not customize the default Ant Design primary color.

- [ ] **Step 6: Implement the shell**

The initial shell must include:

- A skip link to `#main-content`.
- A navigation landmark named `主导航`.
- Links for 应用市场 and 创新广场.
- Static feature-status pages that say the feature is being built without adding business behavior.
- A responsive Ant Design `Layout` with Tailwind layout utilities.
- No gradient styles or decorative continuous animation.

- [ ] **Step 7: Run UI tests and build**

Run:

```powershell
pnpm --filter @ai-hub/web test -- App.test.tsx
pnpm --filter @ai-hub/web typecheck
pnpm --filter @ai-hub/web build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/web packages/ui pnpm-lock.yaml
git commit -m "feat: add React application shell"
```

---

### Task 7: Enforce module and package boundaries

**Files:**
- Create: `dependency-cruiser.cjs`
- Create: `packages/server/src/architecture-boundaries.fixture.ts`
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/worker/package.json`
- Modify: `packages/config/package.json`
- Modify: `packages/contracts/package.json`
- Modify: `packages/database/package.json`
- Modify: `packages/server/package.json`
- Modify: `packages/testing/package.json`
- Modify: `packages/ui/package.json`

**Interfaces:**
- Consumes: package exports and directory ownership.
- Produces: `pnpm boundaries`.

- [ ] **Step 1: Add a deliberate failing dependency rule**

Create a temporary import in `packages/server/src/architecture-boundaries.fixture.ts`:

```ts
import '../../../apps/api/src/api.module.js';

export const invalidDependency = true;
```

- [ ] **Step 2: Create boundary rules**

`dependency-cruiser.cjs` must forbid:

- Circular dependencies.
- Imports from `packages/*/src/**` except through package exports.
- `packages/server/src/**/domain/**` importing NestJS, Kysely, `pg`, HTTP or external SDK packages.
- `packages/server` importing `apps/*`.
- One `apps/web/src/modules/*` module deep-importing another feature module.

- [ ] **Step 3: Run the boundary check and verify it fails**

Run:

```powershell
pnpm boundaries
```

Expected: FAIL and name the import from `packages/server` to `apps/api`.

- [ ] **Step 4: Remove the deliberate violation**

Delete `packages/server/src/architecture-boundaries.fixture.ts`.

- [ ] **Step 5: Run the boundary check**

Run:

```powershell
pnpm boundaries
```

Expected: PASS with zero violations.

- [ ] **Step 6: Commit**

```powershell
git add dependency-cruiser.cjs package.json apps packages
git commit -m "chore: enforce module boundaries"
```

---

### Task 8: Add Windows development and isolated test Compose stacks

**Files:**
- Create: `compose.yaml`
- Create: `compose.dev.yaml`
- Create: `compose.test.yaml`
- Modify: `.env.example`
- Create: `infra/docker/api.Dockerfile`
- Create: `infra/docker/web.Dockerfile`
- Create: `infra/docker/worker.Dockerfile`
- Create: `infra/docker/nginx.conf`
- Create: `docs/development/windows-docker-compose.md`

**Interfaces:**
- Consumes: API, worker, web, PostgreSQL, MinIO, ClamAV.
- Produces: `docker compose -f compose.yaml -f compose.dev.yaml up`.

- [ ] **Step 1: Write an invalid Compose reference**

Create `compose.dev.yaml` with a temporary dependency on `missing-service`.

- [ ] **Step 2: Run Compose validation and verify it fails**

Run:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
```

Expected: FAIL because `missing-service` is undefined.

- [ ] **Step 3: Implement the base stack**

`compose.yaml` must define:

- `postgres` using `postgres:18.4-bookworm`.
- `minio` using `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z`.
- `clamav` using `clamav/clamav:1.4_base`.
- `api`, `worker`, `web`, and `proxy`.
- Named volumes for database, object storage, and virus definitions.
- Health checks for all dependency containers.
- One internal application network.
- No production secrets.

Before writing the Compose file, run:

```powershell
docker manifest inspect quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z
docker manifest inspect clamav/clamav:1.4_base
```

Expected: both manifests resolve. If either image is unavailable, stop this task, select a maintained S3-compatible or malware-scanner image through an ADR, and update this plan before implementation. Do not silently substitute `latest`.

- [ ] **Step 4: Implement the development override**

`compose.dev.yaml` must:

- Bind source directories for hot reload.
- Expose proxy only on `127.0.0.1:8080`.
- Expose PostgreSQL and MinIO admin ports only on `127.0.0.1`.
- Use development credentials from `.env`.
- Start Vite, Nest watch mode, and worker watch mode.
- Remove the temporary `missing-service`.

- [ ] **Step 5: Implement the test override**

`compose.test.yaml` must:

- Use a distinct Compose project name.
- Use isolated volumes.
- Disable real external network integrations.
- Start dependencies, execute `pnpm verify`, and exit.
- Remove test containers and volumes through the documented cleanup command.

- [ ] **Step 6: Validate both stacks**

Run:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
docker compose -f compose.yaml -f compose.test.yaml config --quiet
```

Expected: PASS.

- [ ] **Step 7: Start the development stack and check health**

Run:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
docker compose -f compose.yaml -f compose.dev.yaml ps
Invoke-RestMethod http://127.0.0.1:8080/internal/health/ready
```

Expected: every container is healthy and readiness returns `status: ok`.

- [ ] **Step 8: Document Windows setup**

The document must include:

- Docker Desktop Linux container requirement.
- Required ports.
- First startup.
- Migration command.
- Test command.
- Data reset command with an explicit warning.
- Log inspection.
- Clean shutdown.

- [ ] **Step 9: Commit**

```powershell
git add compose.yaml compose.dev.yaml compose.test.yaml .env.example infra/docker docs/development
git commit -m "chore: add Windows Docker Compose environments"
```

---

### Task 9: Add structured logs, trace IDs, metrics, and HTTP errors

**Files:**
- Create: `packages/server/src/system/observability/observability.module.ts`
- Create: `packages/server/src/system/observability/request-context.middleware.ts`
- Create: `packages/server/src/system/observability/request-context.middleware.test.ts`
- Create: `packages/server/src/system/http/problem-details.filter.ts`
- Create: `packages/server/src/system/http/problem-details.filter.test.ts`
- Create: `infra/monitoring/prometheus.yml`
- Modify: `apps/api/src/api.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `compose.yaml`

**Interfaces:**
- Consumes: inbound `x-request-id` when valid.
- Produces: response `x-request-id`, JSON logs, `ProblemDetails`, `/internal/metrics`.

- [ ] **Step 1: Write failing trace-ID and HTTP-error tests**

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

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --filter @ai-hub/server test -- request-context.middleware.test.ts
pnpm --filter @ai-hub/server test -- problem-details.filter.test.ts
```

Expected: FAIL because the observability module does not exist.

- [ ] **Step 3: Install observability dependencies**

Run:

```powershell
pnpm --filter @ai-hub/server add pino@^9.5.0 pino-http@^10.3.0 prom-client@^15.1.3 ulid@^3.0.1
```

- [ ] **Step 4: Implement request context and the HTTP error filter**

Requirements:

- Accept only a 26-character ULID in `x-request-id`.
- Generate a ULID for missing or invalid values.
- Return the trace ID in the response header.
- Add the trace ID to request-scoped logs and `ProblemDetails`.
- Redact authorization, Cookie, set-cookie, password, secret, token, and database URL fields.
- Convert Nest HTTP exceptions, Zod validation errors, and unknown errors into the shared `ProblemDetails` shape.
- Never expose stack traces, SQL, connection strings, filesystem paths, or raw third-party error bodies to the caller.
- Record unknown errors at `error` level with the same trace ID; return code `INTERNAL_ERROR`.

- [ ] **Step 5: Add metrics**

Expose Prometheus metrics for:

- Process health.
- HTTP duration and status.
- Active requests.
- Database readiness.
- Outbox pending, processing and failed counts.
- Worker handler duration and failures.

The metrics endpoint must bind to the internal proxy path only and must not be linked from the user interface.

- [ ] **Step 6: Run tests and inspect logs**

Run:

```powershell
pnpm --filter @ai-hub/server test
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
Invoke-WebRequest http://127.0.0.1:8080/internal/health/live -Headers @{ 'x-request-id' = '01JZ3M8V9Z3V4F2V3K0R4Y8P6S' }
docker compose -f compose.yaml -f compose.dev.yaml logs api
```

Expected: response and JSON log share the supplied trace ID and contain no credentials.

- [ ] **Step 7: Commit**

```powershell
git add packages/server/src/system/observability packages/server/src/system/http apps/api apps/worker infra/monitoring compose.yaml pnpm-lock.yaml
git commit -m "feat: add observability foundation"
```

---

### Task 10: Add the local verification pipeline and GitLab CI

**Files:**
- Create: `scripts/verify.mjs`
- Create: `scripts/verify-doc-links.mjs`
- Create: `.gitlab-ci.yml`
- Create: `docs/adr/0001-modular-monolith.md`
- Create: `docs/adr/0002-postgres-outbox.md`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: all root quality commands.
- Produces: `pnpm verify`, GitLab `verify` and `container-smoke` jobs.

- [ ] **Step 1: Write a failing documentation-link check**

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

Add one README link to `docs/development/missing.md`.

- [ ] **Step 2: Run the check and verify it fails**

Run:

```powershell
node scripts/verify-doc-links.mjs
```

Expected: FAIL naming `docs/development/missing.md`.

- [ ] **Step 3: Replace the bad link with real project documentation**

README must link to:

- Approved design spec.
- Program roadmap.
- Phase 1 plan.
- Windows Compose guide.
- Both ADRs.

ADR 0001 records React SPA + NestJS modular monolith and rejects Next.js full-stack and microservices.

ADR 0002 records PostgreSQL transactional outbox and rejects Redis/message-queue introduction in V1.

- [ ] **Step 4: Implement the verification runner**

`scripts/verify.mjs` must run sequentially and stop at the first failure:

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm boundaries`
5. `pnpm test`
6. `pnpm build`
7. `node scripts/verify-doc-links.mjs`
8. `docker compose -f compose.yaml -f compose.test.yaml config --quiet`

Use `spawnSync` with `shell: true`, inherit stdio, and return the failing command's exit code.

- [ ] **Step 5: Create GitLab CI**

`.gitlab-ci.yml` must:

- Use Node 24.
- Enable Corepack and install the pinned pnpm version.
- Cache the pnpm store, not `node_modules`.
- Run `pnpm install --frozen-lockfile`.
- Run `pnpm verify`.
- Build API, worker, and Web images only after verification passes.
- Run `docker compose ... config --quiet`.
- Retain test reports and coverage as artifacts.
- Cancel superseded pipelines on the same branch.

- [ ] **Step 6: Run the complete local gate**

Run:

```powershell
pnpm install --frozen-lockfile
pnpm verify
```

Expected: PASS.

- [ ] **Step 7: Run a clean Compose smoke test**

Run:

```powershell
docker compose -f compose.yaml -f compose.test.yaml down -v
docker compose -f compose.yaml -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test
docker compose -f compose.yaml -f compose.test.yaml down -v
```

Expected: test container exits 0 and cleanup removes isolated volumes.

- [ ] **Step 8: Commit**

```powershell
git add scripts/verify.mjs scripts/verify-doc-links.mjs .gitlab-ci.yml docs/adr README.md package.json
git commit -m "ci: add reproducible verification pipeline"
```

---

## Phase 1 Completion Check

- [ ] Run `pnpm verify`.
- [ ] Run the clean Compose smoke test.
- [ ] Start the development stack from a clean volume.
- [ ] Verify Web loads at `http://127.0.0.1:8080`.
- [ ] Verify API liveness and readiness.
- [ ] Stop PostgreSQL and verify readiness returns 503.
- [ ] Restart PostgreSQL and verify readiness recovers.
- [ ] Append one probe outbox event and verify the worker completes it once.
- [ ] Inspect logs and confirm trace IDs and redaction.
- [ ] Confirm `git status --short` is empty.
- [ ] Record the exact resolved dependency and image versions in the Phase 1 completion note.

Expected final evidence:

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
