# 阶段 6 分析、仪表盘、导出与助手实施计划

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 在已接受的阶段 5 平台上，交付可复现的分析、固定仪表盘、可审计导出、受限的 Dify 助手边界与完整的钉钉工作通知矩阵。

**架构：** 在现有 NestJS 模块化单体中新增有界 `analytics` 模块。PostgreSQL 迁移 `0008` 存储已验证的原始行为事件、每日聚合、指标定义、助手授权/审计记录与保留元数据；排序的 `0009` 迁移添加导出任务生命周期扩展。原始事件是事实来源；聚合可重建。仪表盘、导出与助手服务复用 `ActorContext`、RBAC、受众谓词、审计与 Outbox。

**技术栈：** Node.js >=18.18、TypeScript 严格模式、NestJS、Kysely、PostgreSQL、Vitest、Supertest、React/Vite/Ant Design、现有授权、审计、outbox 与通知端口。


## 全局约束

- 阶段 5 从 `feature/phase-05-ai-demand-innovation` 的 `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5` 接受；复用其证据，不要以重跑阶段 3、阶段 4 或阶段 5 完整门禁作为前置条件。
- 延续单企业模型；不新增 `tenant_id`。
- 阶段 6 保留策略下，原始行为事件恰好保留 180 天；每日聚合可从原始事件重建。
- 每个仪表盘、导出、助手与通知路径都必须保留 `ActorContext`、RBAC、受众授权、审计与 Outbox 边界。
- 匿名输出是投影；员工身份只在现有授权审计路径允许处保留。
- Dify 不接收员工编号、内部 URL、文件、二维码或匿名身份，也不通过不受限的公开 Open API 暴露。
- 不引入 Redis、Elasticsearch、消息队列、Kubernetes、微服务或第二套租户模型。
- 不改变阶段 3、4、5 的业务语义；schema 扩展需要排序的阶段 6 迁移（`0008` 基础或 `0009` 导出扩展）与定向测试。
- 不实现阶段 7 的生产部署、安全上线或运维验收。


## 阶段 6 基线

- 基础分支：`feature/phase-05-ai-demand-innovation`。
- 基础提交：`4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`。
- 新分支：`feature/phase-06-analytics-dashboard-export-assistant`。
- 阶段 3、4、5 的已接受证据从路线图、阶段 4/5 计划与台账、ADR 0005/0006 及远程阶段 5 分支消费。
- 现有未跟踪的 `.codex/` 是用户拥有的工作区状态，仍被排除在暂存之外。

## 稳定接口

```ts
export type BehaviorEventName =
  | "application_viewed" | "application_delivered" | "application_downloaded"
  | "demand_viewed" | "demand_liked" | "demand_commented"
  | "review_created" | "review_decided" | "review_sla_breached"
  | "demand_reported" | "export_requested" | "assistant_requested"
  | "assistant_failed" | "notification_queued" | "notification_delivery_retried";

export interface RecordBehaviorEventInput {
  eventName: BehaviorEventName;
  aggregateType: "application" | "demand" | "review" | "export" | "assistant" | "notification";
  aggregateId: string;
  occurredAt: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface MetricDefinition {
  metricKey: string;
  version: number;
  label: string;
  sourceEvents: readonly BehaviorEventName[];
  formula: string;
  timeRange: "day" | "7d" | "30d" | "180d";
  requiredPermission: string;
  audienceRule: string;
  recompute: string;
}

export interface AnalyticsRepository {
  recordEvent(actor: ActorContext | null, input: RecordBehaviorEventInput): Promise<void>;
  rebuildDaily(from: string, to: string): Promise<{ eventCount: number; dayCount: number }>;
  getDashboard(actor: ActorContext, dashboardKey: string, range: { from: string; to: string }): Promise<unknown>;
}
```


## 有序任务

### 任务 1：阶段 6 基线、计划、台账、ADR 与可视化

**文件：** 创建阶段 6 计划、台账、ADR 0007；修改 `processing_visualization.html`。

- [ ] 验证分支、确切的阶段 5 祖先、远程证据、跟踪状态与保留的 `.codex/`。
- [ ] 记录阶段 6 基线以及明确的阶段 3–5 复用与阶段 7 延后项。
- [ ] 在可视化中添加阶段 6 有序工作矩阵与基线事件。
- [ ] 运行 `git diff --check`；提交 `docs(phase-06): establish analytics dashboard assistant plan`。

### 任务 2：行为事件契约、迁移、保留与审计边界

**文件：** `packages/contracts/src/analytics.ts`、契约索引、`packages/database/src/schema.ts`、`migrate.ts`、迁移 `0008`、`packages/database/src/analytics-schema.integration.test.ts`、新的 `packages/server/src/analytics/*` 测试/脚手架。

- [x] 为允许的事件名、元数据限制、180 天保留字段、唯一幂等、每日聚合键、指标定义、导出/助手审计记录、outbox 关联与无 `tenant_id` 编写失败的 PostgreSQL 测试。
- [x] 观察 RED：因为迁移 `0008` 与分析仓库缺失；首次 PostgreSQL 尝试也记录了 Docker 运行时不可用。
- [x] 实现规范化 schema、事件校验、幂等插入、保留边界与事务性配对的审计/outbox 记录。
- [x] 运行定向 contracts/database/server 测试；提交 `feat(phase-06): add behavior event and retention schema`。

### 任务 3：每日聚合、重建与指标字典

**文件：** `packages/server/src/analytics/aggregation.*`、`metric-dictionary.*`、测试、数据库集成测试、`apps/api/test/phase6.real.e2e-spec.ts`。

- [x] 编写失败测试，证明按日分桶、重复事件幂等、180 天边界、重建等价、稳定公式与字典元数据。
- [x] 观察 RED，然后实现最小的 SQL 聚合/重建服务与带版本的指标定义。
- [x] 验证定向单元测试与真实 PostgreSQL 聚合测试；提交 `feat(phase-06): add rebuildable daily analytics`。

### 任务 4：平台、市场、应用与创新仪表盘

**文件：** `packages/server/src/analytics/dashboard.*`、仪表盘测试、契约、API e2e、Web 路由/组件/测试。

- [x] 为固定仪表盘键、指标来源/公式一致性、范围处理与受众过滤的应用/需求数据编写失败测试。
- [x] 从每日聚合实现只读仪表盘查询，在投影前执行权限与受众检查。
- [x] 验证定向 server/API/Web 测试；提交 `feat(phase-06): add core analytics dashboards`。

### 任务 5：评审、部门、风险、运行时与集成仪表盘

**文件：** 仪表盘补充、指标字典、必要时通知/outbox 读取器、定向测试与 API/Web 夹具。

- [x] 为评审 SLA/决策指标、无个体访问列表的部门聚合、风险分桶、运行时健康聚合与集成交付/重试指标编写失败测试。
- [x] 在不改变现有生命周期或通知语义的前提下实现其余固定仪表盘。
- [x] 验证定向测试；提交 `feat(phase-06): add governance and operations dashboards`。

### 任务 6：权限过滤、匿名与可审计的后台导出

**文件：** `packages/server/src/analytics/export.*`、仅在需要时扩展迁移、契约、测试、API/Web 导出路由测试。

- [x] 为权限拒绝、行序列化前的受众过滤、匿名投影、请求/完成/失败/下载审计、有界日期范围与非公开路由编写失败测试。
- [x] 通过现有服务边界实现已认证的导出任务；不返回未授权的应用访问列表或敏感事件元数据。
- [x] 验证定向 server/API/Web 导出测试；提交 `feat(phase-06): add audited analytics exports`。

### 任务 7：Dify 最小上下文、脱敏、授权评审与降级

**文件：** `packages/server/src/analytics/assistant.*`、`dify.port.ts`、脱敏测试、API e2e、契约、ADR/台账更新。

- [x] 编写失败测试，证明对员工编号、内部 URL、文件、二维码与匿名身份的脱敏；显式授权评审；超时/5xx 的安全降级；允许/拒绝/成功/失败的审计。
- [x] 实现依赖注入的 Dify 端口，仅在仪表盘/需求受众检查后组装最小上下文；不添加公开 Open API。
- [x] 验证假提供方单元测试与真实 API 边界测试；提交 `feat(phase-06): add guarded external assistant boundary`。

### 任务 8：钉钉通知矩阵与 Outbox 投递验证

**文件：** `packages/server/src/notification/*`、契约、矩阵测试、worker 测试、API/Outbox 集成测试、台账/ADR。

- [x] 为每个固定通知场景、收件人授权、幂等键、审计元数据、重试/失败状态以及业务事务内不直接调用提供商编写失败测试。
- [x] 通过现有 Outbox 与钉钉端口实现完整的阶段 6 矩阵；保留失败用于重试与安全的运维评审。
- [x] 验证定向 server/worker/PostgreSQL 测试；提交 `feat(phase-06): complete DingTalk work notification matrix`。

### 任务 9：API、PostgreSQL e2e、Web 路由、权限、审计、导出与助手

**文件：** `apps/api/test/phase6.real.e2e-spec.ts`、`apps/api/test/phase6.e2e-spec.ts`、Web 分析测试/路由、台账、可视化。

- [x] 为事件摄取、重建等价、全部仪表盘键、权限/受众/匿名规则、导出审计、Dify 脱敏/降级与 Outbox 通知投递编写失败的跨层测试。
- [x] 只实现 RED 测试暴露的缺失装配与路由覆盖。
- [x] 运行定向 API/Web/PostgreSQL 测试；在台账与可视化中更新精确计数；提交 `test(phase-06): verify analytics dashboard export assistant flows`（`da8ac75`）。

### 任务 10：阶段 6 最终门禁、双轴评审、提交、推送与草稿 PR

**文件：** 台账、ADR、计划复选框、可视化；不涉及无关源文件。

- [ ] 精确运行必需的最终门禁命令与 Compose config；不要用缓存结果代替。
- [ ] 在标准与阶段 6 规格轴上评审完整阶段 6 diff；解决所有可执行发现项。
- [ ] 验证分支祖先/状态并无强推推送；仅当外部权限允许时创建/更新草稿 PR，否则把确切阻断项记录为未完成。
- [ ] 只有在全新证据支持每项声明后，才提交 `docs(phase-06): close analytics dashboard assistant gates`。


## 完成门禁

只有满足以下条件，阶段 6 才可称为完成：仪表盘可从原始事件复现；权限与匿名正确；每个导出都经过审计；Dify 不接收任何被禁止的敏感数据；真实 PostgreSQL/API/Web 测试通过；两个评审轴均无可执行发现项；阶段 6 分支已推送；存在草稿 PR 或外部阻断项被明确记录。
