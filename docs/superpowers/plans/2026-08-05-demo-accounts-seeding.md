# 演示账号与组织架构初始化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地/测试环境中提供五个按组织架构设计可登录的演示账号，并以幂等 seed 初始化部门、角色、员工和关系数据。

**Architecture:** 在 `@ai-hub/database` 增加只负责 PostgreSQL 数据写入的演示数据 seed 边界；根目录脚本使用现有 `PasswordService` 生成 scrypt 哈希后调用它。开发 Compose 自动运行显式 seed，生产 Compose 不运行；现有登录、会话和迁移逻辑保持不变。

**Tech Stack:** TypeScript、Kysely、PostgreSQL、NestJS IdentityService、Vitest、Testcontainers、pnpm/tsx、Docker Compose。

## Global Constraints

- 演示账号仅用于开发和测试，不写入正式数据库迁移，不在生产 Compose 自动创建。
- 密码只以现有 `PasswordService` 生成的 scrypt 哈希写入 `employees.password_hash`，不保存明文密码。
- seed 必须在一个事务中幂等执行，不删除其他数据；重复执行只恢复固定演示工号的状态、部门、角色和测试密码。
- 工号使用固定的 `DEMO-*` 值，账号状态为 `active`，`password_reset_required` 为 `false`。
- 遵循当前数据库 schema、Kysely repository 和 Vitest/Testcontainers 测试模式，不引入新运行时依赖。

---

## 文件边界

- Create: `packages/database/src/demo-seed.ts` — 演示部门、角色、账号定义及事务 seed 函数。
- Modify: `packages/database/src/index.ts` — 导出演示 seed API。
- Create: `packages/database/src/demo-seed.integration.test.ts` — 验证首次 seed、幂等更新和关系数据。
- Create: `scripts/seed-demo-accounts.mts` — 读取 `DATABASE_URL`、生成哈希并调用 seed。
- Create: `scripts/seed-demo-accounts.test.mjs` — 验证缺少 `DATABASE_URL` 时 CLI 以明确错误退出。
- Modify: `package.json` — 增加 `seed:demo-accounts` 命令。
- Modify: `compose.dev.yaml` — 开发 API 启动时在迁移后运行 seed。
- Create: `apps/api/test/demo-accounts.real.e2e-spec.ts` — 用真实 repository/service 验证五个账号登录。
- Modify: `README.md` — 记录开发命令、地址、账号和密码。
- Modify: `processing_visualization.html` — 完成后记录开发/测试结果。

### Task 1: Define the database seed contract and write the failing schema test

**Files:**
- Create: `packages/database/src/demo-seed.ts`
- Modify: `packages/database/src/index.ts`
- Create: `packages/database/src/demo-seed.integration.test.ts`

**Interfaces:**
- Produces `DEMO_DEPARTMENT_DEFINITIONS`, `DEMO_ROLE_DEFINITIONS`, `DEMO_ACCOUNT_DEFINITIONS`.
- Produces `seedDemoAccounts(db: Kysely<DatabaseSchema>, passwordHashes: Readonly<Record<string, string>>): Promise<SeedDemoAccountsResult>`.
- `SeedDemoAccountsResult` contains counts for departments, roles, employees, memberships, and role assignments.

- [ ] **Step 1: Write the failing test**

Add a Testcontainers-backed Vitest test that runs `runMigrations(db)`, calls the not-yet-existing seed function with one deterministic hash per fixed demo employee, and asserts:

```ts
expect(await db.selectFrom("departments").selectAll().execute()).toHaveLength(4);
expect(await db.selectFrom("employees").selectAll().execute()).toHaveLength(5);
expect(await db.selectFrom("employee_roles").selectAll().execute()).toHaveLength(5);
expect(await db.selectFrom("roles").select("role_code").where("role_code", "in", ["application_admin", "demand_operator"]).execute()).toHaveLength(2);
```

Also assert the parent department IDs, `active` status, `password_reset_required = false`, primary memberships, and the exact role codes for all five accounts.

- [ ] **Step 2: Run the test and verify it fails for the missing seed API**

Run: `pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts`

Expected: FAIL because `demo-seed.ts` and `seedDemoAccounts` do not exist yet, not because PostgreSQL or migration setup is broken.

- [ ] **Step 3: Implement the minimal seed definitions and transaction**

Implement the fixed data:

```ts
const demoAccounts = [
  ["DEMO-EMPLOYEE", "演示普通员工", "demo-rnd", "employee"],
  ["DEMO-APP-ADMIN", "演示应用管理员", "demo-rnd", "application_admin"],
  ["DEMO-INNOVATION", "演示创新运营管理员", "demo-innovation", "demand_operator"],
  ["DEMO-ORG-ADMIN", "演示组织管理员", "demo-admin", "organization_admin"],
  ["DEMO-SUPER-ADMIN", "演示超级管理员", "demo-admin", "super_admin"],
] as const;
```

Use one `db.transaction().execute(...)` boundary. Upsert the four local departments, the two missing system roles, the five employees, their primary memberships, and employee role rows. Set `password_hash` from the function input; update demo rows to `active` and `password_reset_required = false`; use `onConflict(...).doNothing()` or `doUpdateSet(...)` so reruns create no duplicates. Encode role permissions as JSONB and preserve existing system-role definitions for `employee`, `organization_admin`, and `super_admin`.

- [ ] **Step 4: Run the focused database test and verify it passes**

Run: `pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts`

Expected: PASS with all expected departments, employees, memberships, roles, and role assignments present.

- [ ] **Step 5: Add the idempotency assertion and keep it green**

Extend the same test to change `DEMO-EMPLOYEE` to `disabled` with an old hash, call seed again with a new hash map, and assert there is still one employee row with `active`, the new hash, and one membership/role row. Re-run the focused test.

## Task 2: Add the CLI seed command and development wiring

**Files:**
- Create: `scripts/seed-demo-accounts.mts`
- Create: `scripts/seed-demo-accounts.test.mjs`
- Modify: `package.json`
- Modify: `compose.dev.yaml`

**Interfaces:**
- Consumes the database seed API from Task 1 and `PasswordService` from `@ai-hub/server`.
- Produces the executable command `pnpm seed:demo-accounts`.

- [ ] **Step 1: Write the failing CLI error-path test**

Create `scripts/seed-demo-accounts.test.mjs` with Node's built-in test runner. Spawn `pnpm exec tsx scripts/seed-demo-accounts.mts` with `DATABASE_URL` removed from the child environment and assert a non-zero exit plus `DATABASE_URL is required` in stderr. This proves the CLI's required configuration behavior without needing a database.

- [ ] **Step 2: Run the CLI error-path test and verify it fails**

Run: `node --test scripts/seed-demo-accounts.test.mjs`

Expected: FAIL because `scripts/seed-demo-accounts.mts` does not exist yet or does not emit the required configuration error.

- [ ] **Step 3: Implement the CLI with existing password hashing**

In `scripts/seed-demo-accounts.mts`, require `DATABASE_URL`, create the database with `createDatabase`, hash these development-only passwords using `new PasswordService().hashPassword(...)`, call `seedDemoAccounts`, print only row counts, and always destroy the database in `finally`. Do not print plaintext passwords or hashes. Add:

```json
"seed:demo-accounts": "tsx scripts/seed-demo-accounts.mts"
```

Update only the development API command to run `pnpm migrate && pnpm seed:demo-accounts && exec pnpm --filter @ai-hub/api dev`; leave `compose.production.yaml` unchanged.

- [ ] **Step 4: Run the CLI error-path test and command against a disposable migrated database**

Run `node --test scripts/seed-demo-accounts.test.mjs`, then the focused integration test and, when a local PostgreSQL service is available, run `pnpm migrate` followed by `pnpm seed:demo-accounts` with its test `DATABASE_URL`. Expected output reports counts only and the second run reports the same counts without duplicate rows.

## Task 3: Verify real password login for all five accounts

**Files:**
- Create: `apps/api/test/demo-accounts.real.e2e-spec.ts`

**Interfaces:**
- Consumes `seedDemoAccounts`, `KyselyIdentityRepository`, `IdentityService`, `PasswordService`, `createDatabase`, `runMigrations`, and `startPostgresTestContainer`.

- [ ] **Step 1: Write the failing real-login test**

Start a PostgreSQL test container, run migrations, generate the five known test password hashes with `PasswordService`, seed the database, construct `IdentityService(new KyselyIdentityRepository(db), passwordService)`, and assert for each account:

```ts
await expect(
  identity.loginWithPassword({ employeeId, password, deviceLabel: "demo-test" }),
).resolves.toMatchObject({
  actor: { employeeId, roleCodes: [expectedRole], sessionId: expect.any(String) },
});
```

- [ ] **Step 2: Run the new test and verify it fails before the implementation is complete**

Run: `pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts`

Expected: FAIL because the seed command/data boundary is not yet implemented; the failure should be a missing module/API or absent seeded employee, not an invalid test setup.

- [ ] **Step 3: Make the smallest implementation changes needed to pass**

Use the Task 1 seed API and existing identity repository/service without changing login behavior. If a role assignment order is nondeterministic, assert role membership by value only where the contract does not guarantee order; for these single-role demo accounts, assert the one expected role.

- [ ] **Step 4: Run the real-login test and the focused seed test**

Run: `pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts` and `pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts`.

Expected: PASS; every account receives a valid session and expected role, and the seed remains idempotent.

## Task 4: Document credentials, update project memory, and run verification

**Files:**
- Modify: `README.md`
- Modify: `processing_visualization.html`

- [ ] **Step 1: Update README with the local workflow**

Document `pnpm migrate`, `pnpm seed:demo-accounts`, the development URL `http://127.0.0.1:8080`, the five fixed employee IDs/passwords, and the explicit warning that the accounts are not for production. Do not add credentials to `.env` or production deployment files.

- [ ] **Step 2: Update the processing visualization after implementation and tests**

Add one factual `dev`/`test` task and matching event to `seedData`, adjust the affected phase progress/bullets, and record that five demo accounts were seeded and real password login was verified. Keep the existing user changes in this file intact.

- [ ] **Step 3: Run proportionate verification**

Run:

```text
pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts
pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts
pnpm typecheck
pnpm lint
pnpm format:check
pnpm boundaries
```

If Docker/Testcontainers is unavailable, report that limitation and still run non-container checks; do not claim real-login verification without the integration test passing.

- [ ] **Step 4: Review the final diff**

Run `git diff --check` and `git status --short`; verify no `.env`, production Compose, password hash, or unrelated user changes were modified. Report the test account table and exact verification outcomes in the final handoff.
