# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库中工作时提供指引。

## 项目概览

AI Hub Platform —— 面向企业 AI 应用共享平台的 pnpm monorepo。三个可部署应用（React SPA、NestJS API、NestJS outbox worker）以模块化单体架构共享多个包。Node.js 24.15.0 为基线版本，支持 Node.js >18。

## 常用命令

```bash
# 安装依赖
corepack pnpm install --frozen-lockfile

# 完整验证流水线（format → lint → typecheck → boundaries → test → build → doc-links → governance → compose config）
corepack pnpm verify

# 单项检查
pnpm format:check          # Prettier
pnpm lint                   # Turbo 对所有 workspace 运行 ESLint
pnpm typecheck              # Turbo 对所有 workspace 运行 tsc --noEmit
pnpm boundaries             # dependency-cruiser 模块边界检查
pnpm test                   # scripts 使用 Node test runner + workspace 使用 vitest（串行）
pnpm build                  # Turbo 构建所有 workspace
pnpm migrate                # 针对 DATABASE_URL 运行 Kysely 迁移

# 单 workspace 命令（在根目录运行）
pnpm --filter @ai-hub/api test
pnpm --filter @ai-hub/api lint
pnpm --filter @ai-hub/database test

# 启动开发环境（应用地址 http://127.0.0.1:8080）
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600

# 在容器中运行 CI 测试套件
docker compose -f compose.yaml -f compose.test.yaml run --rm test
```

## Monorepo 结构

```
apps/
  api/         @ai-hub/api      — NestJS API 入口，通过 ApiModule.register() 组装各模块
  web/         @ai-hub/web      — React SPA（Vite + React Router + Ant Design + Tailwind）
  worker/      @ai-hub/worker   — NestJS outbox worker，轮询 outbox_events 并分发处理器
packages/
  config/      @ai-hub/config   — 基于环境变量的 Zod 校验 RuntimeConfig
  contracts/   @ai-hub/contracts — 共享 TypeScript 类型（无运行时依赖）
  database/    @ai-hub/database — Kysely schema、迁移、OutboxStore
  server/      @ai-hub/server   — 全部领域逻辑：NestJS 模块、服务、控制器、仓库
  testing/     @ai-hub/testing  — Testcontainers 辅助（PostgreSQL）
  ui/          @ai-hub/ui       — Ant Design 主题令牌
```

### 依赖规则（由 dependency-cruiser 强制检查）

- `@ai-hub/contracts` 是叶子包 —— 无运行时依赖
- `@ai-hub/config` 仅依赖 `zod`
- `@ai-hub/database` 依赖 `contracts`、`kysely`、`pg`
- `@ai-hub/server` 依赖 `contracts`、`database`、`pino`、NestJS
- 各应用依赖 packages，但应用之间互不依赖
- `server` 内的领域模块不得从其他领域模块导入基础设施关注点（NestJS 控制器、HTTP）

## 架构模式

### 领域模块模式

`packages/server/src/<domain>/` 下的每个领域模块（identity、application、catalog、interaction、notification、creator、demand、analytics）都遵循相同的结构：

- **`<domain>.module.ts`** —— NestJS `DynamicModule`，提供 `static register(databaseUrl)` 与 `static forTest(mock)` 工厂。生产装配创建真实的 Kysely 仓库；测试装配接受 mock 服务。
- **`<domain>.service.ts`** —— 纯业务逻辑，依赖仓库接口与端口抽象（不依赖 NestJS 或 HTTP）。
- **`<domain>.controller.ts`** —— NestJS 控制器，薄委托给服务：提取 header/参数、传给服务、转换结果。
- **`<domain>.repository.ts`** —— 仓库接口的 Kysely 实现。
- **`<domain>.types.ts`** —— 仓库接口、端口接口与领域类型。仓库通过 `withTransaction()` 保证原子性。
- **`<domain>.tokens.ts`** ——（可选）当抽象类/接口需要 DI 符号时的 NestJS 注入令牌。

### 模块注册

`ApiModule.register(databaseUrl)` 是组合根 —— 它为每个模块创建新的 Kysely 实例，因此每个领域模块拥有独立的数据库连接池（每个最多 10 个）。各模块的 `forTest()` 静态方法接受预先构建的 mock 服务，从而支持隔离的集成测试。

### 授权模型

`IdentityService.authorize()` 执行 RBAC：`super_admin` 跳过所有检查；其他角色匹配 `{resourceType}.{action}` 权限。`AudienceEvaluator` 回调控制部门范围的可见性 —— 在测试中会被替换。

### 事务性 Outbox

后台工作（例如钉钉通知）会在与源变更相同的数据库事务中原子地写入 `outbox_events`。worker 通过 `SELECT ... FOR UPDATE SKIP LOCKED` 轮询、分发给已注册的处理器，并记录完成/失败状态。处理器必须幂等 —— 投递语义为 at-least-once（至少一次）。

### Web 应用

基于 React Router、Ant Design 组件、Tailwind CSS 与 TanStack Query 管理服务端状态的 React SPA。目前是静态外壳 —— 大部分页面是代表规划中功能区域的占位 UI。应用使用来自 `@ai-hub/ui` 的自定义主题，并通过 Ant Design 的 `ConfigProvider` 设置 `zh_CN` 语言环境。

## 测试

- **单元测试**：内存版仓库实现（例如测试文件内的 `MemoryIdentityRepository`）。服务被隔离测试，无需数据库。
- **集成测试**：使用 `@ai-hub/testing` → `startPostgresTestContainer()` 启动 testcontainers PostgreSQL 实例；也可以设置 `TEST_DATABASE_URL` 使用共享数据库。
- **测试运行器**：workspace 包使用 Vitest（`vitest run`）；scripts 使用 Node 内置测试运行器（`node --test`）。
- **测试文件约定**：与被测代码同目录的 `*.test.ts` 文件；集成测试使用 `*.integration.test.ts`。

## 基础设施服务（Docker Compose）

| 服务            | 用途                              |
| --------------- | --------------------------------- |
| PostgreSQL 18.4 | 主数据库（Kysely ORM）            |
| Garage v2.3     | 兼容 S3 的对象存储（仅开发/测试） |
| ClamAV 1.4.5    | 上传制品的恶意软件扫描            |
| Prometheus      | 收集 API 与 worker 的指标         |
| nginx           | 反向代理，转发到 web 与 API       |

## 关键设计决策（ADR）

- **ADR 0001**：React SPA + NestJS 模块化单体（不用 Next.js、不用微服务）
- **ADR 0002**：后台工作使用 PostgreSQL 事务性 outbox（不用 Redis/AMQP）
- **ADR 0003**：本地使用 Garage 作为 S3 兼容存储（MinIO 镜像不可用）
