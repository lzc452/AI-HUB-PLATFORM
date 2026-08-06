# AI Hub 阶段 3 应用交付与评审实施计划

状态：已完成，收尾跟踪由 `2026-08-03-ai-hub-phase-03-closeout.md` 取代。

阶段 3 完成决策：包含所有权字段；四渠道端到端发布是硬门禁；评审池、认领/释放、SLA 与通知 outbox 事件为最小范围。外部通知投递与完整的评审运维 UI 仍延后。

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 交付 V1 路线图所需的阶段 3 应用、不可变版本、四渠道交付、制品安全、发布、评审、审计与回滚基线。

**架构：** 在 `packages/server` 中新增深度 `application` 模块，由 Kysely 表与稳定契约支撑。状态变更使用同一个事务边界，写入应用审计与 outbox 记录。制品处理位于存储、恶意软件扫描、签名与哈希端口之后；确定性内存适配器使核心可测试，而 Garage/ClamAV 仍为部署适配器。版本与评审迁移在持久化之前拒绝无效状态变更。

**技术栈：** Node.js >=18.18、TypeScript 严格模式、NestJS 10、Kysely、PostgreSQL 18、Vitest、React/Vite/Ant Design、兼容 Garage 的 S3 端口、兼容 ClamAV 的扫描端口。

## 全局约束

- 单企业、单实例；不引入 `tenant_id`。
- 阶段 2 的 `ActorContext`、`AuthorizationRequest` 与 `AuthorizationDecision` 是阶段 3 消费的唯一授权边界。
- 应用版本创建后不可变；编辑会创建新版本。
- 扫描失败或签名无效的制品不能进入人工评审或发布。
- 已批准的应用不能被物理删除；撤回与归档是独立状态。
- 每个状态变更的应用操作都在同一个 PostgreSQL 事务中写入审计与 outbox 记录。
- Web、桌面、移动端与小程序交付配置保持独立。
- V1 不新增 Redis、消息队列、Elasticsearch、Kubernetes、公开 Open API 或微服务。

---

## 文件结构

```text
packages/contracts/src/application.ts
packages/contracts/src/index.ts
packages/database/src/migrations/0003_application_delivery_review.ts
packages/database/src/migrate.ts
packages/database/src/schema.ts
packages/server/src/application/application.types.ts
packages/server/src/application/application.repository.ts
packages/server/src/application/application.service.ts
packages/server/src/application/application.service.test.ts
packages/server/src/application/application.controller.ts
packages/server/src/application/application.module.ts
packages/server/src/application/storage.port.ts
packages/server/src/application/storage.memory.ts
packages/server/src/application/storage.pipeline.ts
packages/server/src/application/storage.pipeline.test.ts
packages/server/src/index.ts
apps/api/src/api.module.ts
apps/api/test/application.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/App.test.tsx
docs/adr/0004-application-version-release-review.md
processing_visualization.html
```

## 稳定接口

```ts
export type ApplicationId = string;
export type ApplicationVersionId = string;
export type DeliveryChannel = "web" | "desktop" | "mobile" | "mini_program";
export type ApplicationStatus = "draft" | "in_review" | "approved" | "published" | "withdrawn" | "archived";

export interface ApplicationVersionInput {
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string;
  scanStatus: "passed";
}

export interface DeliveryConfig {
  channel: DeliveryChannel;
  entryUrl: string;
  minClientVersion?: string;
  enabled: boolean;
}
```

## 任务 1：契约与数据库基线

**文件：** 契约应用类型；迁移 `0003`；数据库 schema/注册表；数据库集成测试。

- [ ] 为应用、版本、四个交付渠道、评审、审计记录、唯一性、状态检查、不可变制品字段与无 `tenant_id` 添加失败的 schema 断言。
- [ ] 运行集成测试并确认因缺少迁移 `0003` 而失败。
- [ ] 实现迁移、Kysely 接口、迁移注册与契约导出。
- [ ] 使用 Docker Desktop 运行同一集成测试并确认所有 schema 断言通过。
- [ ] 运行 database/contracts 的 typecheck、lint 与 format 检查。

## 任务 2：应用/版本/发布状态机

**文件：** `packages/server/src/application/application.types.ts`、仓库端口、服务、测试、server 导出。

- [ ] 为不可变版本、重复版本拒绝、合法的 draft → review → approved → published → withdrawn → archived 迁移、自评拒绝、未批准即发布拒绝与物理删除拒绝添加失败测试。
- [ ] 运行定向测试并确认服务缺失。
- [ ] 实现仓库端口、事务感知服务、授权调用、审计/outbox 发出与内存测试仓库。
- [ ] 运行定向测试、server typecheck 与 server lint。

## 任务 3：制品安全流水线

**文件：** 存储/哈希/扫描/签名端口、内存存储适配器、流水线、流水线测试；流水线通过后才扩展服务。

- [ ] 为缺失/重复分块、摘要不匹配、恶意软件拒绝、无效签名与成功的临时到最终复制添加失败测试。
- [ ] 运行并确认流水线缺失。
- [ ] 实现有序分块组装、SHA-256 校验、扫描与签名检查、失败清理与最终键复制。
- [ ] 运行定向流水线测试、server typecheck 与 lint。

## 任务 4：API 与交付配置

**文件：** application 控制器/模块、API 模块、API e2e 测试。

- [ ] 为创建应用、版本元数据、全部四个交付渠道、受保护的评审、发布、撤回、归档、已发布版本查询与通用授权拒绝添加失败的 API 测试。
- [ ] 运行 API e2e 测试并确认路由缺失。
- [ ] 将模块与阶段 2 的 database/identity 服务注册，并实现兼容 ProblemDetails 的路由。
- [ ] 重新运行 API e2e 以及 API typecheck/lint/测试。

## 任务 5：Web 管理界面

**文件：** `apps/web/src/app/router.tsx`、`apps/web/src/app/App.test.tsx`，仅在必要时使用共享样式。

- [ ] 为应用、版本、评审与交付导航及生命周期标签添加失败的 UI 测试。
- [ ] 在外壳中实现可访问的加载、空、被拒、撤回、归档与已发布状态，不包含业务写入。
- [ ] 运行定向 UI 测试、lint、typecheck 与 Vite 构建。

## 任务 6：最终门禁与项目记忆

**文件：** API/数据库端到端补充、ADR 0004、`processing_visualization.html`。

- [ ] 为扫描/签名拒绝、审批不可变性、旧版本可用性、回滚与归档/物理删除边界添加失败断言。
- [ ] 只实现缺失的集成行为，并记录状态机与外部凭据风险。
- [ ] 使用 Docker/Testcontainers 运行全新的无缓存 server/API/database 测试。
- [ ] 使用阶段 2 门禁证据与事实性的阶段 3 事件、进度、问题、解决方案与跳过项更新处理可视化。

## 阶段 3 最终门禁

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm boundaries
corepack pnpm test
corepack pnpm build
node scripts/verify-doc-links.mjs
docker compose -f compose.yaml -f compose.test.yaml config --quiet
```

全新证据还必须包含：

```powershell
& 'D:\HighPowerWorkspace\AI-HUB-PLATFORM\node_modules\.bin\vitest.cmd' run src/application/application.service.test.ts src/application/storage.pipeline.test.ts
& 'D:\HighPowerWorkspace\AI-HUB-PLATFORM\node_modules\.bin\vitest.cmd' run test/application.e2e-spec.ts
& 'D:\HighPowerWorkspace\AI-HUB-PLATFORM\node_modules\.bin\vitest.cmd' run src/outbox/outbox-store.integration.test.ts
```

只有满足以下条件，阶段 3 才开启：每个命令退出码为 0、所有 API/数据库断言通过、失败制品无法进入评审、已批准应用不能被物理删除、旧版本保持可读，且处理可视化记录了证据。
