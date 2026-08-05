# 演示账号与组织架构初始化设计

## 背景

当前身份迁移只初始化系统角色，没有初始化部门、员工、部门成员关系或员工角色关系。登录接口要求员工状态为 `active`、存在 scrypt 密码哈希且不要求密码重置，因此本地开发和测试环境缺少可直接登录的完整数据集。

## 目标

- 提供五个与组织架构设计对应的可登录测试账号：普通员工、应用管理员、创新运营管理员、组织管理员、超级管理员。
- 初始化演示部门树、员工主部门、部门成员关系、角色定义和员工角色关系。
- seed 可重复执行，不删除其他业务数据；仅面向本地/测试环境，不让生产启动流程自动创建演示账号。
- 用自动化测试验证 seed 数据和现有密码登录链路。

## 非目标

- 不修改正式业务账号、钉钉同步、登录协议或会话生命周期。
- 不把演示账号写入数据库迁移；生产环境只执行正式迁移。
- 不为演示账号创建应用、需求、通知或分析业务数据。

## 账号与组织数据

部门树使用本地来源：`demo-company`（演示企业）为根节点，下设 `demo-rnd`（研发中心）、`demo-innovation`（创新运营部）和 `demo-admin`（平台管理部）。

| 工号 | 展示名 | 主部门 | 角色 | 本地测试密码 |
| --- | --- | --- | --- | --- |
| `DEMO-EMPLOYEE` | 演示普通员工 | 研发中心 | `employee` | `Demo-Employee-2026!` |
| `DEMO-APP-ADMIN` | 演示应用管理员 | 研发中心 | `application_admin` | `Demo-AppAdmin-2026!` |
| `DEMO-INNOVATION` | 演示创新运营管理员 | 创新运营部 | `demand_operator` | `Demo-Innovation-2026!` |
| `DEMO-ORG-ADMIN` | 演示组织管理员 | 平台管理部 | `organization_admin` | `Demo-OrgAdmin-2026!` |
| `DEMO-SUPER-ADMIN` | 演示超级管理员 | 平台管理部 | `super_admin` | `Demo-SuperAdmin-2026!` |

密码只用于本地/测试环境，使用现有 `PasswordService` 生成 scrypt 哈希；数据库只保存哈希，不保存明文密码。`application_admin` 作为系统角色授予应用创建、读取、更新、审核、发布和 creator 汇总读取权限；`demand_operator` 作为系统角色覆盖需求全流程权限并保留现有业务代码对该角色的识别。已有 `employee`、`organization_admin` 和 `super_admin` 定义沿用当前迁移内容。

## 实现方案

新增独立的 `pnpm seed:demo-accounts` 命令。命令读取 `DATABASE_URL`，使用现有数据库连接和身份密码服务，在一个事务中幂等 upsert 部门、角色、员工、成员关系和员工角色关系。演示工号是固定的，重复执行会把演示账号恢复为 active 并刷新其本地测试密码；不会触碰非演示数据，也不会删除任何数据。

开发 Compose 的 API 启动命令在正式迁移成功后调用该 seed；生产 Compose 不调用。脚本只输出初始化数量，不输出密码哈希或明文凭据。README 记录开发地址、执行命令和这五组测试凭据。

## 验证

- 数据库集成测试：首次 seed 写入预期的部门、角色、员工、成员关系和角色绑定；重复 seed 不产生重复行并更新演示账号状态/哈希。
- 登录集成测试：使用真实 Kysely identity repository 和 `IdentityService.loginWithPassword()` 验证五个账号均能成功登录，并返回预期 `roleCodes` 和有效会话。
- 运行相关数据库/API 测试、类型检查、lint、格式检查；完成后更新根目录 `processing_visualization.html`。

## 安全边界

演示账号仅允许用于开发和测试。生产部署文档不提供 seed 命令，生产 Compose 不自动执行 seed；如果未来需要生产初始化账号，必须走组织管理员/密码重置流程，而不是复用这批固定凭据。

## 实施计划

### 1. 数据库 seed 边界

文件：

- 新增 `packages/database/src/demo-seed.ts`
- 修改 `packages/database/src/index.ts`
- 新增 `packages/database/src/demo-seed.integration.test.ts`

步骤：

1. 先写 Testcontainers 集成测试，验证迁移后调用 `seedDemoAccounts` 能写入 4 个部门、5 个员工、2 个新增角色和 5 条角色绑定。
2. 运行 `pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts`，确认在 seed API 不存在时按预期失败。
3. 实现以下接口：

   ```ts
   seedDemoAccounts(
     db: Kysely<DatabaseSchema>,
     passwordHashes: Readonly<Record<string, string>>,
   ): Promise<SeedDemoAccountsResult>
   ```

   同时导出固定的部门、角色和账号定义。所有 upsert 在一个事务中执行；员工写入 `active`、`password_reset_required = false` 和传入的密码哈希，成员关系和角色关系使用冲突处理避免重复。

4. 重新运行 focused test，确认首次 seed 通过。
5. 在同一测试中把 `DEMO-EMPLOYEE` 改成 disabled/旧哈希后再次 seed，确认只保留一行且恢复为 active/新哈希，成员关系和角色关系不重复。

### 2. CLI 与开发环境接入

文件：

- 新增 `scripts/seed-demo-accounts.mts`
- 新增 `scripts/seed-demo-accounts.test.mjs`
- 修改根目录 `package.json`
- 修改 `compose.dev.yaml`

步骤：

1. 先写 Node 内置测试：删除子进程的 `DATABASE_URL`，执行 `pnpm exec tsx scripts/seed-demo-accounts.mts`，断言非零退出且 stderr 包含 `DATABASE_URL is required`。
2. 运行 `node --test scripts/seed-demo-accounts.test.mjs`，确认缺少脚本或配置时失败。
3. 实现 CLI：读取 `DATABASE_URL`，使用现有 `PasswordService` 为五个本地测试密码生成 scrypt 哈希，调用数据库 seed，最终销毁连接；只打印行数，不打印明文密码或哈希。
4. 增加命令：

   ```json
   "seed:demo-accounts": "tsx scripts/seed-demo-accounts.mts"
   ```

   让开发 API 启动命令按 `pnpm migrate && pnpm seed:demo-accounts && exec pnpm --filter @ai-hub/api dev` 执行，生产 Compose 保持不变。
5. 在可用的临时 PostgreSQL 上执行两次 seed，确认输出数量稳定且没有重复行。

### 3. 真实登录验证

文件：

- 新增 `apps/api/test/demo-accounts.real.e2e-spec.ts`

步骤：

1. 先写真实 PostgreSQL 测试：启动 Testcontainers、运行迁移、生成五个密码哈希、执行 seed，并用 `KyselyIdentityRepository` 和 `IdentityService.loginWithPassword()` 登录五个账号。
2. 运行 `pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts`，确认实现前失败原因是 seed 数据/API 缺失。
3. 使用现有登录服务，不改动登录协议；每个账号断言返回自身工号、预期单角色和有效 session ID。
4. 同时运行数据库 seed 集成测试和 API 真实登录测试，确认全部通过。

### 4. 文档、项目记录与总验证

文件：

- 修改 `README.md`
- 修改根目录 `processing_visualization.html`

步骤：

1. README 记录 `pnpm migrate`、`pnpm seed:demo-accounts`、开发地址 `http://127.0.0.1:8080`、五组工号/密码及仅限开发测试的警告。
2. 完成实现和测试后，在 `processing_visualization.html` 的 `seedData` 与 `events` 中记录 seed 和真实登录验证结果，保留现有未提交改动。
3. 运行以下验证：

   ```text
   node --test scripts/seed-demo-accounts.test.mjs
   pnpm --filter @ai-hub/database test -- demo-seed.integration.test.ts
   pnpm --filter @ai-hub/api test -- demo-accounts.real.e2e-spec.ts
   pnpm typecheck
   pnpm lint
   pnpm format:check
   pnpm boundaries
   ```

4. 最后运行 `git diff --check` 和 `git status --short`，确认没有修改 `.env`、生产 Compose、无关用户文件或提交密码哈希；只有在真实登录集成测试通过后，才在交付中声明账号可登录。
