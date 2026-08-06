# 演示账号与组织架构初始化实施计划

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**Goal:** 在本地/测试环境中提供五个按组织架构设计可登录的演示账号，并以幂等 seed 初始化部门、角色、员工和关系数据。

**Architecture:** 在 `@ai-hub/database` 增加只负责 PostgreSQL 数据写入的演示数据 seed 边界；根目录脚本使用现有 `PasswordService` 生成 scrypt 哈希后调用它。开发 Compose 自动运行显式 seed，生产 Compose 不运行；现有登录、会话和迁移逻辑保持不变。

**技术栈：** TypeScript、Kysely、PostgreSQL、NestJS IdentityService、Vitest、Testcontainers、pnpm/tsx、Docker Compose。

## 全局约束

- 演示账号仅用于开发和测试，不写入正式数据库迁移，不在生产 Compose 自动创建。
- 密码只以现有 `PasswordService` 生成的 scrypt 哈希写入 `employees.password_hash`，不保存明文密码。
- seed 必须在一个事务中幂等执行，不删除其他数据；重复执行只恢复固定演示工号的状态、部门、角色和测试密码。
- 工号使用固定的 `DEMO-*` 值，账号状态为 `active`，`password_reset_required` 为 `false`。
- 遵循当前数据库 schema、Kysely repository 和 Vitest/Testcontainers 测试模式，不引入新运行时依赖。

---

## 文件边界

- 创建：`packages/database/src/demo-seed.ts` — 演示部门、角色、账号定义及事务 seed 函数。
- 修改：`packages/database/src/index.ts` — 导出演示 seed API。
- 创建：`packages/database/src/demo-seed.integration.test.ts` — 验证首次 seed、幂等更新和关系数据。
- 创建：`scripts/seed-demo-accounts.mts` — 读取 `DATABASE_URL`、生成哈希并调用 seed。
- 创建：`scripts/seed-demo-accounts.test.mjs` — 验证缺少 `DATABASE_URL` 时 CLI 以明确错误退出。
- 修改：`package.json` — 增加 `seed:demo-accounts` 命令。
- 修改：`compose.dev.yaml` — 开发 API 启动时在迁移后运行 seed。
- 创建：`apps/api/test/demo-accounts.real.e2e-spec.ts` — 用真实 repository/service 验证五个账号登录。
- 修改：`README.md` — 记录开发命令、地址、账号和密码。
- 修改：`processing_visualization.html` — 完成后记录开发/测试结果。

### 任务 1：定义数据库种子契约并编写失败的 schema 测试

**文件：**
- 创建：`packages/database/src/demo-seed.ts`
- 修改：`packages/database/src/index.ts`
- 创建：`packages/database/src/demo-seed.integration.test.ts`

**接口：**
- 产出 `DEMO_DEPARTMENT_DEFINITIONS`、`DEMO_ROLE_DEFINITIONS`、`DEMO_ACCOUNT_DEFINITIONS`。
- 产出 `seedDemoAccounts(db: Kysely<DatabaseSchema>, passwordHashes: Readonly<Record<string, string>>): Promise<SeedDemoAccountsResult>`。
- `SeedDemoAccountsResult` 包含部门、角色、员工、成员关系与角色分配的计数。

- [ ] **步骤 1：编写失败测试**

添加一个 Testcontainers 支持的 Vitest 测试：运行 `runMigrations(db)`，为每个固定演示员工用一个确定性哈希调用尚不存在的 seed 函数，并断言：

```ts
expect(await db.selectFrom("departments").selectAll().execute()).toHaveLength(4);
expect(await db.selectFrom("employees").selectAll().execute()).toHaveLength(5);
expect(await db.selectFrom("employee_roles").selectAll().execute()).toHaveLength(5);
expect(await db.selectFrom("roles").select("role_code").where("role_code", "in", ["application_admin", "demand_operator"]).execute()).toHaveLength(2);
```

同时断言父部门 ID、`active` 状态、`password_reset_required = false`、主成员关系，以及全部五个账号的确切角色码。

- [ ] **步骤 2：运行测试并验证因缺失 seed API 而失败**

运行：`pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts`

预期：FAIL，因为 `demo-seed.ts` 与 `seedDemoAccounts` 尚不存在，而不是因为 PostgreSQL 或迁移配置损坏。

- [ ] **步骤 3：实现最小的 seed 定义与事务**

实现固定数据：

```ts
const demoAccounts = [
  ["DEMO-EMPLOYEE", "演示普通员工", "demo-rnd", "employee"],
  ["DEMO-APP-ADMIN", "演示应用管理员", "demo-rnd", "application_admin"],
  ["DEMO-INNOVATION", "演示创新运营管理员", "demo-innovation", "demand_operator"],
  ["DEMO-ORG-ADMIN", "演示组织管理员", "demo-admin", "organization_admin"],
  ["DEMO-SUPER-ADMIN", "演示超级管理员", "demo-admin", "super_admin"],
] as const;
```

使用一个 `db.transaction().execute(...)` 边界。Upsert 四个本地部门、两个缺失的系统角色、五个员工、他们的主成员关系与员工角色行。从函数输入设置 `password_hash`；将演示行更新为 `active` 与 `password_reset_required = false`；使用 `onConflict(...).doNothing()` 或 `doUpdateSet(...)`，使重复运行不产生重复。将角色权限编码为 JSONB，并保留 `employee`、`organization_admin` 与 `super_admin` 的现有系统角色定义。

- [ ] **步骤 4：运行定向数据库测试并验证通过**

运行：`pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts`

预期：PASS，所有预期的部门、员工、成员关系、角色与角色分配都存在。

- [ ] **步骤 5：添加幂等断言并保持绿色**

扩展现有测试：把 `DEMO-EMPLOYEE` 改为带旧哈希的 `disabled`，用新的哈希映射再次调用 seed，并断言仍只有一行员工记录（`active`、新哈希）与一行成员关系/角色记录。重新运行定向测试。

## 任务 2：添加 CLI seed 命令与开发装配

**文件：**
- 创建：`scripts/seed-demo-accounts.mts`
- 创建：`scripts/seed-demo-accounts.test.mjs`
- 修改：`package.json`
- 修改：`compose.dev.yaml`

**接口：**
- 消费任务 1 的数据库 seed API 与 `@ai-hub/server` 的 `PasswordService`。
- 产出可执行命令 `pnpm seed:demo-accounts`。

- [ ] **步骤 1：编写失败的 CLI 错误路径测试**

使用 Node 内置测试运行器创建 `scripts/seed-demo-accounts.test.mjs`。在子环境中移除 `DATABASE_URL` 后 spawn `pnpm exec tsx scripts/seed-demo-accounts.mts`，断言非零退出码且 stderr 包含 `DATABASE_URL is required`。这无需数据库即可证明 CLI 的必需配置行为。

- [ ] **步骤 2：运行 CLI 错误路径测试并验证失败**

运行：`node --test scripts/seed-demo-accounts.test.mjs`

预期：FAIL，因为 `scripts/seed-demo-accounts.mts` 尚不存在或未发出所需的配置错误。

- [ ] **步骤 3：使用现有密码哈希实现 CLI**

在 `scripts/seed-demo-accounts.mts` 中：要求 `DATABASE_URL`，用 `createDatabase` 创建数据库，用 `new PasswordService().hashPassword(...)` 为这些仅开发使用的密码生成哈希，调用 `seedDemoAccounts`，只打印行计数，并始终在 `finally` 中销毁数据库。不要打印明文密码或哈希。添加：

```json
"seed:demo-accounts": "tsx scripts/seed-demo-accounts.mts"
```

只更新开发 API 命令为运行 `pnpm migrate && pnpm seed:demo-accounts && exec pnpm --filter @ai-hub/api dev`；保持 `compose.production.yaml` 不变。

- [ ] **步骤 4：针对一次性迁移数据库运行 CLI 错误路径测试与命令**

运行 `node --test scripts/seed-demo-accounts.test.mjs`，然后运行定向集成测试；当本地 PostgreSQL 服务可用时，使用其测试 `DATABASE_URL` 依次运行 `pnpm migrate` 与 `pnpm seed:demo-accounts`。预期输出只报告计数，第二次运行报告相同计数且无重复行。

## 任务 3：验证五个账号的真实密码登录

**文件：**
- 创建：`apps/api/test/demo-accounts.real.e2e-spec.ts`

**接口：**
- 消费 `seedDemoAccounts`、`KyselyIdentityRepository`、`IdentityService`、`PasswordService`、`createDatabase`、`runMigrations` 与 `startPostgresTestContainer`。

- [ ] **步骤 1：编写失败的真实登录测试**

启动 PostgreSQL 测试容器，运行迁移，用 `PasswordService` 生成五个已知测试密码哈希，seed 数据库，构造 `IdentityService(new KyselyIdentityRepository(db), passwordService)`，并对每个账号断言：

```ts
await expect(
  identity.loginWithPassword({ employeeId, password, deviceLabel: "demo-test" }),
).resolves.toMatchObject({
  actor: { employeeId, roleCodes: [expectedRole], sessionId: expect.any(String) },
});
```

- [ ] **步骤 2：运行新测试并验证在实现完成前失败**

运行：`pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts`

预期：FAIL，因为 seed 命令/数据边界尚未实现；失败应是缺失模块/API 或缺少已 seed 的员工，而不是测试配置无效。

- [ ] **步骤 3：做出最小的必要实现变更使其通过**

使用任务 1 的 seed API 与现有身份仓库/服务，不改变登录行为。如果角色分配顺序不确定，在契约不保证顺序之处只按值断言角色成员关系；对于这些单角色演示账号，断言唯一预期角色。

- [ ] **步骤 4：运行真实登录测试与定向 seed 测试**

运行：`pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts` 与 `pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts`。

预期：PASS；每个账号都获得有效会话与预期角色，且 seed 保持幂等。

## 任务 4：记录凭据、更新项目记忆并运行验证

**文件：**
- 修改：`README.md`
- 修改：`processing_visualization.html`

- [ ] **步骤 1：用本地工作流更新 README**

记录 `pnpm migrate`、`pnpm seed:demo-accounts`、开发地址 `http://127.0.0.1:8080`、五个固定员工 ID/密码，以及这些账号不可用于生产的明确警告。不要向 `.env` 或生产部署文件添加凭据。

- [ ] **步骤 2：实现与测试后更新处理可视化**

在 `seedData` 中添加一条事实性的 `dev`/`test` 任务与匹配事件，调整受影响的阶段进度/要点，并记录五个演示账号已 seed 且真实密码登录已验证。保持该文件中现有的用户改动不变。

- [ ] **步骤 3：运行相称的验证**

运行：

```text
pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts
pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts
pnpm typecheck
pnpm lint
pnpm format:check
pnpm boundaries
```

如果 Docker/Testcontainers 不可用，请报告该限制并仍运行非容器检查；集成测试未通过前不得声称真实登录已验证。

- [ ] **步骤 4：评审最终 diff**

运行 `git diff --check` 与 `git status --short`；确认没有修改 `.env`、生产 Compose、密码哈希或无关的用户变更。在最终交接中报告测试账号表与确切的验证结果。
