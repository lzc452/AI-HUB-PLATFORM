# AI Hub 阶段 5 AI 需求与创新广场实施计划

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 交付受治理、可审计的 AI 需求生命周期，从结构化请求一路到创新广场协作、优先级排序、试点、应用关联与正式应用发布，且不绕过阶段 3 应用生命周期门禁。

**架构：** 在现有 NestJS 模块化单体中新增有界 `demand` 模块。PostgreSQL 迁移 `0006` 存储规范化的需求、受众、协作、治理、进度、试点、应用关联与审计记录；所有写入使用仓库事务、审计行与 outbox 事件。受众谓词在列表/详情输出前应用，匿名展示仅存在于呈现层，应用发布委托给现有 `ApplicationService`，因此制品校验、评审、发布与归档防护仍然权威。

**技术栈：** Node.js >=18.18、TypeScript 严格模式、NestJS、Kysely、PostgreSQL、Vitest、Supertest、React/Vite/Ant Design、现有 `ActorContext`、RBAC、授权、审计、Outbox 与应用生命周期模块。


## 全局约束

- 阶段 4 作为输入从提交 `f60def66699bfbb0192b60fa1d256d98159d198b` 接受；不要以重跑阶段 4 或阶段 3 完整门禁作为阶段 5 前置条件。
- 延续单企业模型；不新增 `tenant_id`。
- 继续使用 `ActorContext`、RBAC、受众授权、事务边界、审计与 Outbox。
- 匿名展示绝不删除真实身份；管理员溯源需要授权与审计事件。
- 认领、合并、状态迁移与主解决方案选择必须使用数据库并发保护并产生审计记录。
- 不得物理删除需求、讨论、举报或关联；使用状态迁移与审计元数据。
- 不引入 Redis、Elasticsearch、消息队列、Kubernetes、微服务或公开 Open API。
- 阶段 6 分析仪表盘、导出、外部 Dify 助手与指标字典延后。
- 不改变已完成的阶段 4 业务语义；扩展需要新迁移与定向测试。
- 正式应用发布路径必须委托给现有阶段 3 `ApplicationService`，不得直接将应用设置为 `published`。


## 阶段 5 基线

- 基础分支：`feature/phase-04-market-search-interaction`。
- 基础提交：`f60def66699bfbb0192b60fa1d256d98159d198b`。
- 新分支：`feature/phase-05-ai-demand-innovation`。
- 阶段 3 门禁证据仍从 Codex 会话 `019fc537-5ae6-7f42-bb49-ff0fc969afac` 接受；此处不重复。
- 现有未跟踪的 `.codex/` 是用户拥有的工作区状态，仍被排除在暂存之外。
- 阶段 4 证据从其计划、执行台账、ADR 0005 与远程分支消费；阶段 5 之前不重复阶段 4 完整门禁。

## 文件结构

```text
packages/contracts/src/demand.ts
packages/contracts/src/index.ts
packages/database/src/schema.ts
packages/database/src/migrate.ts
packages/database/src/migrations/0006_ai_demand_innovation.ts
packages/server/src/demand/demand.tokens.ts
packages/server/src/demand/demand.types.ts
packages/server/src/demand/demand.repository.ts
packages/server/src/demand/demand.service.ts
packages/server/src/demand/demand.service.test.ts
packages/server/src/demand/demand.controller.ts
packages/server/src/demand/demand.module.ts
packages/server/src/index.ts
packages/server/src/application/application.service.ts
packages/server/src/application/application.types.ts
packages/server/src/application/application.repository.ts
apps/api/src/api.module.ts
apps/api/test/phase5.e2e-spec.ts
apps/api/test/phase5.real.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/phase5.test.tsx
apps/web/src/app/App.tsx
docs/adr/0006-phase-05-ai-demand-innovation.md
docs/superpowers/plans/2026-08-03-ai-hub-phase-05-execution-ledger.md
processing_visualization.html
```

## 稳定接口

```ts
export type DemandStatus =
  | "draft" | "pending_review" | "rejected" | "published"
  | "in_progress" | "pilot" | "completed" | "closed" | "merged";
export type DemandAudienceType = "all" | "department" | "employee";
export type DemandCollaboratorRole = "owner" | "collaborator" | "operator";
export type DemandApplicationRole = "candidate" | "pilot" | "solution";

export interface CreateDemandInput {
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  audienceType: DemandAudienceType;
  departmentId?: string;
  employeeId?: string;
  includeChildren?: boolean;
  displayAnonymously?: boolean;
}

export interface DemandPriorityInput {
  businessValue: number;
  implementationCost: number;
  riskLevel: number;
  adminPriority: number;
}

export interface DemandEntry {
  demandId: string;
  requesterEmployeeId?: string;
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  status: DemandStatus;
  audienceType: DemandAudienceType;
  audienceDepartmentId: string | null;
  displayAnonymously: boolean;
  likeCount: number;
  commentCount: number;
  priorityScore: number | null;
  priorityExplanation: string | null;
  ownerEmployeeId: string | null;
  primarySolutionApplicationId: string | null;
  version: number;
}

export interface DemandRepository {
  withTransaction<T>(operation: (repository: DemandRepository) => Promise<T>): Promise<T>;
  createDemand(input: CreateDemandInput & { requesterEmployeeId: string }): Promise<DemandEntry>;
  saveDraft(actor: ActorContext, demandId: string, input: Partial<CreateDemandInput>): Promise<DemandEntry>;
  submitForReview(actor: ActorContext, demandId: string): Promise<DemandEntry>;
  review(actor: ActorContext, demandId: string, decision: "publish" | "reject", reason?: string): Promise<DemandEntry>;
  listVisible(actor: ActorContext, filters: { status?: DemandStatus; query?: string }): Promise<readonly DemandEntry[]>;
  findVisible(actor: ActorContext, demandId: string): Promise<DemandEntry | null>;
}
```


## 有序任务

### 任务 1：阶段 5 基线、计划、台账、ADR 与可视化

**文件：** 本计划、执行台账、ADR 0006、`processing_visualization.html`。

- [x] 验证当前分支、确切的阶段 4 提交、远程跟踪分支、干净的跟踪状态与保留的 `.codex/` 状态。
- [x] 从阶段 4 分支创建 `feature/phase-05-ai-demand-innovation`。
- [x] 在台账与 ADR 中记录接受的基线与明确的阶段 4/6 边界。
- [x] 用进行中的阶段 5 任务与基线事件更新可视化。
- [x] 运行 `git diff --check`，然后提交 `docs(phase-05): establish AI demand innovation plan`。

### 任务 2：契约、迁移、状态模型、受众与审计边界

**文件：** `packages/contracts/src/demand.ts`、契约索引、数据库 schema/迁移器、迁移 `0006`、需求类型/仓库脚手架、迁移测试。

- [x] 为规范化需求、受众检查、只追加的讨论/举报/关联表、唯一点赞/协作者、乐观版本、部分唯一主解决方案、审计、outbox 与无 `tenant_id` 编写失败的迁移测试。
- [x] 运行定向测试并观察因缺少 `0006` 而失败（启用已记录的 Docker Desktop 引擎后，断言在缺失的表/约束/触发器上失败）。
- [x] 实现带检查约束、外键、索引、乐观版本列与阻止需求内容表物理删除触发器的迁移。
- [x] 添加契约与 Kysely schema 类型；注册 `0006`。
- [x] 运行定向 PostgreSQL 迁移测试并提交 `feat(phase-05): add demand contracts and schema`。

### 任务 3：需求创建、草稿、轻量评审与驳回

**文件：** demand 服务/仓库/控制器/模块、服务测试、API 测试、server 导出。

- [x] 为必填字段校验、草稿保存/恢复、提交评审、仅评审人决策、驳回原因、不可变需求方身份与事务审计/outbox 编写失败测试。
- [x] 运行服务测试使其先红。
- [x] 实现最小校验与状态迁移：`draft -> pending_review -> published|rejected`，带评审人授权且不物理删除。
- [x] 运行定向服务/API 测试、更新台账并提交 `feat(phase-05): add governed demand submission`。

### 任务 4：需求列表/详情、受众过滤、匿名展示、点赞、讨论与举报

**文件：** 仓库/服务/控制器，必要时使用 interaction 契约、服务测试、API/Web 测试、router/App。

- [x] 编写失败测试，证明 all/department/employee 受众在分页前过滤列表/搜索/详情，且匿名时普通读者看不到需求方身份。
- [x] 为幂等点赞/取消点赞、只追加的单层讨论、隐藏内容过滤、举报创建、内容治理隐藏/恢复与授权匿名身份查询审计编写失败测试。
- [x] 使用与阶段 4 目录读取相同的受众语义实现读写路径；在存储中保留身份并拒绝物理删除。
- [x] 添加带加载、空、被拒、隐藏与关闭状态的创新广场与需求详情路由。
- [x] 运行定向 server/API/Web 测试并提交 `feat(phase-05): add demand square interactions`。

### 任务 5：认领、所有者、协作者、运营人员选择与并发保护

**文件：** demand 仓库/服务/控制器/测试，必要时补充迁移约束、API e2e。

- [x] 为首次写入者优先认领、仅所有者修改协作者、运营人员分配、重复协作者拒绝、过期版本冲突与每次分配的审计/outbox 编写失败测试。
- [x] 运行测试使其先红。
- [x] 实现原子 `UPDATE ... WHERE version = expectedVersion`/唯一约束，并在丢失更新时返回 `DEMAND_CONFLICT`。
- [x] 运行定向测试并提交 `feat(phase-05): protect demand ownership concurrency`。

### 任务 6：价值/成本/风险/优先级评分与管理员审计

**文件：** 契约、schema/仓库/服务/控制器/测试、Web 优先级视图。

- [x] 为 1–5 有界输入、确定性可解释分数、仅管理员修改、审计详情与带 ID 决胜的稳定排序编写失败测试。
- [x] 实现有文档的分数公式，持久化输入与解释，并只暴露已授权的优先级数据。
- [x] 运行定向测试并提交 `feat(phase-05): add explainable demand prioritization`。

### 任务 7：状态推进、官方进度、试点与关闭

**文件：** demand 状态服务/仓库/控制器、测试、API/Web 路由。

- [x] 为允许的状态图、无效迁移拒绝、官方进度授权、试点日期/结果、关闭原因与只追加的状态/进度审计编写失败测试。
- [x] 在乐观并发下实现状态迁移；每个迁移发出 outbox 事件与审计行。
- [x] 运行定向测试并提交 `feat(phase-05): add demand progress and pilot lifecycle`。

### 任务 8：合并、多对多应用关联、主解决方案与正式应用列表

**文件：** application 桥接契约/服务、demand 仓库/服务/控制器、仅在需要时扩展迁移、测试、API e2e。

- [x] 为合并冲突保护、合并需求可见性、多对多关联、单一主解决方案、关联角色授权与关联审计编写失败测试。
- [x] 编写失败的集成测试：从需求创建正式应用，并证明发布仍要求制品校验、评审与阶段 3 发布防护。
- [x] 将 `createApplicationFromDemand` 实现为事务性审计的桥接，通过现有应用服务创建应用草稿，绝不直接把 `applications.status` 更新为 `published`。
- [x] 运行定向服务/API 与 PostgreSQL e2e 测试并提交 `feat(phase-05): close demand to application loop`。

### 任务 9：API/Web e2e、PostgreSQL 验证、完整门禁与双轴评审

**文件：** 阶段 5 API 真实 e2e、Web 测试、台账、ADR、可视化、评审说明。

- [x] 运行定向服务/API/Web 测试与真实 PostgreSQL e2e，覆盖受众、治理、并发、合并、审计、outbox 与应用生命周期门禁。
- [x] 精确运行阶段 5 最终门禁命令：format、lint、typecheck、boundaries、完整测试、build、文档链接与 Compose config。
- [x] 在标准与规格轴上评审 `git diff f60def66699bfbb0192b60fa1d256d98159d198b..HEAD`；解决可执行发现项。
- [x] 在台账中记录精确计数、跳过的外部能力与任何环境阻断项；更新可视化。
- [x] 提交 `docs(phase-05): close AI demand innovation gates`。

### 任务 10：GitHub 交接

**文件：** 除收尾文档外无其他；若 GitHub 元数据需要事实性更新则相应调整。

- [ ] 验证状态、分支、提交祖先与远程 URL。
- [ ] 不使用强推推送 `feature/phase-05-ai-demand-innovation`。
- [ ] 若写入权限与连接器支持可用，创建或更新草稿 PR；否则记录确切的权限阻断项并报告为未完成。


## 阶段 5 门禁

只有满足以下条件，阶段 5 才可称为完成：需求到正式应用的路径被证明未绕过阶段 3 门禁；合并、认领、状态迁移与主解决方案选择具备并发保护与审计；匿名与受众行为与应用侧一致；PostgreSQL/API/Web 测试与每一条最终门禁命令通过；双轴评审无未解决执行项；分支已提交并推送；存在草稿 PR 或外部权限阻断项被明确记录为未完成。
