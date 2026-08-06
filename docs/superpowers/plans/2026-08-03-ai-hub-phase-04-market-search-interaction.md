# AI Hub 阶段 4 市场、搜索、互动与创作者中心实施计划

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 在阶段 3 应用生命周期之上，交付阶段 4 的应用市场、权限过滤搜索、详情与交付分析、互动治理、通知中心、健康标签与创作者中心只读模型。

**架构：** 在 `packages/server` 下新增有界的 `catalog`、`interaction`、`notification` 与 `creator` 模块，由 PostgreSQL 迁移 `0004`、`0005` 与稳定契约支撑。目录查询在排序前于数据库查询路径应用受众授权；互动与通知以事务方式写入审计/outbox 记录；创作者数据只提供聚合，绝不暴露个体访问列表。API 暴露受保护路由，Web 外壳消费只读模型而不重复授权规则。

**技术栈：** Node.js >=18.18、TypeScript 严格模式、NestJS、Kysely、PostgreSQL、Vitest、Supertest、React/Vite/Ant Design、现有 Outbox 与 ActorContext 边界。


## 全局约束

- 阶段 3 门禁证据从会话 `019fc537-5ae6-7f42-bb49-ff0fc969afac` 接受；不要把重跑完整阶段 3 门禁作为前置条件。
- 保持单企业模型；不新增 `tenant_id`。
- 不引入 Redis、Elasticsearch、消息队列、Kubernetes、公开 Open API 或微服务。
- 所有目录列表、搜索、推荐、详情、面向 Dify、导出与下载读取，都必须在返回行之前按当前员工的应用受众过滤。
- V1 使用固定的运营排序；不实现个性化推荐或独立收藏。
- 版本与已批准的公开内容保持不可变；阶段 4 可新增只读模型与事件记录，但不得削弱阶段 3 生命周期防护。
- 匿名展示绝不从审计记录中移除真实员工身份；匿名身份查询需要专门的超管授权决策，并且本身会被审计。
- 外部钉钉投递失败不回滚已成功的业务操作；通知投递使用幂等键、重试状态与失败可见性。
- 创作者与应用团队的分析只暴露聚合，绝不暴露个体访客/访问列表。
- 所有状态变更写入都使用现有的事务、审计与 outbox 边界。


## 阶段 4 基线

- 基础提交/标签：注解标签 `phase-03-complete`（标签对象 `978612d5ae8f125f4e328186d59257ff6dd7011e`，提交 `d3b99e9bfdb0e6d2447054608ee9a3c6584984e2`）。
- 分支：`feature/phase-04-market-search-interaction`。
- 阶段 3 门禁结果：从所引用的 Codex 会话接受；本计划刻意不重复该门禁。
- 现有未跟踪的 `.codex/` 是用户拥有的工作区状态，被排除在暂存之外。
- 当前消费的阶段 3 公共接口：`ActorContext`、`AuthorizationRequest`、`AuthorizationDecision`、`ApplicationRepository`、应用生命周期、交付记录、审计事件与事务性 outbox。


## 文件结构

只创建或修改以下区域：

```text
packages/contracts/src/catalog.ts
packages/contracts/src/interaction.ts
packages/contracts/src/notification.ts
packages/contracts/src/index.ts
packages/database/src/schema.ts
packages/database/src/migrations/0004_catalog_interaction.ts
packages/database/src/migrations/0005_notification_creator.ts
packages/server/src/catalog/catalog.types.ts
packages/server/src/catalog/catalog.repository.ts
packages/server/src/catalog/catalog.service.ts
packages/server/src/catalog/catalog.service.test.ts
packages/server/src/catalog/catalog.controller.ts
packages/server/src/catalog/catalog.module.ts
packages/server/src/interaction/interaction.types.ts
packages/server/src/interaction/interaction.repository.ts
packages/server/src/interaction/interaction.service.ts
packages/server/src/interaction/interaction.service.test.ts
packages/server/src/interaction/interaction.controller.ts
packages/server/src/interaction/interaction.module.ts
packages/server/src/notification/notification.types.ts
packages/server/src/notification/notification.repository.ts
packages/server/src/notification/notification.service.ts
packages/server/src/notification/notification.service.test.ts
packages/server/src/notification/dingtalk.port.ts
packages/server/src/notification/notification.controller.ts
packages/server/src/notification/notification.module.ts
packages/server/src/creator/creator.types.ts
packages/server/src/creator/creator.repository.ts
packages/server/src/creator/creator.service.ts
packages/server/src/creator/creator.service.test.ts
packages/server/src/creator/creator.controller.ts
packages/server/src/creator/creator.module.ts
packages/server/src/index.ts
apps/api/src/api.module.ts
apps/api/test/phase4.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/App.tsx
apps/web/src/app/phase4.test.tsx
docs/adr/0005-phase-04-catalog-interaction-notification.md
docs/superpowers/plans/2026-08-03-ai-hub-phase-04-execution-ledger.md
processing_visualization.html
```

## 稳定接口

```ts
export type CatalogSort = "recommended" | "latest" | "popular";
export type TrustLabel = "experimental" | "verified" | "recommended" | "deprecated";

export interface CatalogQuery {
  actor: ActorContext;
  query?: string;
  categoryId?: string;
  tagIds?: readonly string[];
  applicationType?: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}

export interface CatalogEntry {
  applicationId: string;
  name: string;
  summary: string;
  departmentId: string;
  categoryId: string;
  tagIds: readonly string[];
  trustLabels: readonly TrustLabel[];
  currentVersionId: string;
  publishedAt: Date;
  deliveryChannels: readonly DeliveryChannel[];
  likeCount: number;
  ratingAverage: number | null;
}

export interface NotificationRecord {
  notificationId: string;
  recipientEmployeeId: string;
  eventType: string;
  idempotencyKey: string;
  readAt: Date | null;
  createdAt: Date;
}
```


## 有序任务

### 任务 1：契约与目录 schema

**文件：** 契约目录类型；数据库 schema；迁移 `0004`；迁移注册；schema 集成测试。

- [ ] 为受众行、分类、标签、应用-标签关联、目录标签、规范化搜索字段、发布可见性、员工/应用互动唯一性与无 `tenant_id` 编写失败断言。
- [ ] 运行定向 schema 测试并确认因缺少阶段 4 表而失败。
- [ ] 实现规范化表、外键、唯一约束、索引、检查约束与 Kysely 接口。将搜索文本、拼音与首字母存为显式的索引字段；不要把类型化目录数据藏在大 JSON 列中。
- [ ] 运行定向迁移/schema 测试并确认在 PostgreSQL 上通过。
- [ ] 提交 `feat(phase-04): add catalog contracts and schema`。

### 任务 2：权限过滤的目录、搜索、排序与详情

**文件：** catalog 模块文件；server 导出；API 模块；catalog 单元测试。

- [ ] 编写失败测试，证明受众之外的员工在列表/搜索/推荐/详情中得不到任何结果，而部门成员能获得允许的应用。
- [ ] 编写失败测试，覆盖精确名称、名称前缀、标签/分类、摘要模糊匹配、拼音/首字母匹配、固定推荐/最新/热门排序、分页与废弃标签可见性。
- [ ] 通过一个在排序与分页前应用受众谓词的仓库查询，实现 `CatalogService.list`、`CatalogService.search`、`CatalogService.getDetail` 与 `CatalogService.recordDeliveryAction`。
- [ ] 写入时使用确定性拼音/首字母规范化器，读取时使用 PostgreSQL 索引匹配；避免 Elasticsearch 依赖。
- [ ] 运行 catalog 单元测试、database typecheck、server typecheck 与 lint。
- [ ] 提交 `feat(phase-04): add permission-filtered catalog search`。

### 任务 3：详情、交付动作、健康与信任标签

**文件：** catalog 契约/仓库/服务；数据库迁移扩展；API e2e 测试；ADR。

- [ ] 编写失败测试，覆盖仅已发布版本的详情、阻止未发布制品下载、四渠道动作指标、健康检查状态、废弃替代文案与仅聚合的创作者指标。
- [ ] 实现版本/风险/交付快照、`web_redirect`、`package_download` 与 `mini_program_qr` 动作事件，以及固定的健康/信任/废弃标签。
- [ ] 在返回任何交付 URL 之前，将下载授权与发布检查保留在 server 服务中。
- [ ] 运行定向 API/database 测试并提交 `feat(phase-04): add delivery metrics and trust labels`。

### 任务 4：点赞、评分、回复、举报、隐藏与匿名审计

**文件：** interaction 契约；迁移扩展；interaction 模块；interaction 测试；API e2e 测试。

- [ ] 编写失败测试，覆盖点赞/取消点赞幂等、每个员工/应用一条评分、1–5 星校验、可编辑评审、评审时版本快照、单层回复、官方回复授权、举报创建、内容治理隐藏/恢复、禁用用户展示与物理删除拒绝。
- [ ] 编写失败测试，证明匿名展示对普通读者隐藏身份，且超管身份查询会产生审计事件。
- [ ] 实现事务感知的 interaction 仓库方法，并通过 `ActorContext` 与对象关系执行授权。
- [ ] 保持举报非破坏性；用状态与审计元数据隐藏内容，而不是删除行。
- [ ] 运行定向 interaction 测试并提交 `feat(phase-04): add governed application interactions`。

### 任务 5：应用内通知与钉钉重试

**文件：** notification 契约；迁移 `0005`；notification 模块；钉钉适配器端口；notification 测试；API e2e 测试。

- [ ] 编写失败测试，覆盖应用/评审/撤回/举报事件创建通知、幂等重复投递、已读/未读状态、重试退避状态，以及外部失败不回滚业务事务。
- [ ] 实现带持久应用内记录、outbox 幂等键与 `DingTalkNotificationPort` 的 `NotificationService.createForEvent`、`markRead` 与 `retryDelivery`。
- [ ] 将外部传输保持在端口之后；确定性测试适配器记录尝试，无需真实钉钉凭据。
- [ ] 运行定向 notification 测试并提交 `feat(phase-04): add notification center and retry state`。

### 任务 6：创作者中心聚合与 Web 界面

**文件：** creator 模块；Web router/App；Web 测试；API e2e 测试。

- [ ] 编写失败测试，覆盖版本差异、校验报告展示、单应用聚合指标、所有者/维护人授权与拒绝访客列表查询。
- [ ] 仅使用聚合 SQL 实现 creator 只读模型；不返回员工级访问记录。
- [ ] 为市场、搜索、详情、互动、通知与创作者中心添加可访问的 Web 路由与状态。保持 Web 外壳读写边界明确，并展示加载、空、错误、撤回、归档与废弃状态。
- [ ] 运行定向 Web 测试、API e2e 与 build。
- [ ] 提交 `feat(phase-04): add creator center and market UI routes`。

### 任务 7：收尾台账、评审与门禁

**文件：** 阶段 4 台账；ADR 0005；处理可视化；任何测试修正。

- [ ] 记录已接受的阶段 3 基线、每个阶段 4 提交、测试证据、延后的外部钉钉凭据与剩余阶段 5 边界。
- [ ] 用事实性的阶段 4 进度、问题、解决方案与跳过项更新处理可视化。
- [ ] 运行全新的阶段 4 定向测试以及项目完整验证命令：`corepack pnpm format:check`、`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm boundaries`、`corepack pnpm test`、`corepack pnpm build`、`node scripts/verify-doc-links.mjs` 与 `docker compose -f compose.yaml -f compose.test.yaml config --quiet`。
- [ ] 在标准与规格两个轴上评审 `git diff phase-03-complete...HEAD`；解决所有可执行的发现项。
- [ ] 提交 `docs(phase-04): close market and interaction gates`。
- [ ] 若 GitHub 认证/连接器支持可用，推送阶段分支并创建 GitHub 草稿 PR；否则不强行推送，而是报告确切的外部阻断项。


## 阶段 4 门禁

只有满足以下条件，阶段 4 才可称为完成：已记录接受的阶段 3 基线；阶段 4 定向 PostgreSQL/API/Web 测试通过；列表/搜索/推荐/详情/下载的权限过滤得到证明；互动与匿名审计测试通过；通知幂等/重试测试通过；创作者指标仅聚合；所有列出的质量门禁退出码为 0；双轴评审无未解决的执行项；分支已提交并推送。
