# 阶段 6 执行台账

日期：2026-08-03

## 基线决策

阶段 5 作为输入从远程分支 `feature/phase-05-ai-demand-innovation` 的提交 `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5` 接受。阶段 3、4、5 的已接受证据从其计划、台账、ADR、路线图与远程分支证据消费。阶段 6 在实施前不重跑这些完整门禁。新分支为 `feature/phase-06-analytics-dashboard-export-assistant`。

现有未跟踪的 `.codex/` 是用户拥有的工作区状态，被排除在暂存之外。

## 范围与非目标

阶段 6 交付原始行为事件、180 天保留、可重建的每日聚合、固定平台/市场/应用/创新/评审/部门/风险/运行时/集成仪表盘、指标定义、带权限与审计的导出、受限的 Dify 助手边界，以及通过 Outbox 投递的完整钉钉工作通知矩阵。它不改变阶段 3–5 业务语义，也不实现阶段 7 生产部署、安全上线或运维验收。禁止 Redis、Elasticsearch、消息队列、Kubernetes、微服务、公开 Open API、新租户模型与敏感 Dify 上下文。

## 有序执行

1. 基线、计划、台账、ADR、可视化。
2. 行为事件契约、迁移、保留、审计边界。
3. 每日聚合、重建、指标字典。
4. 平台/市场/应用/创新仪表盘。
5. 评审/部门/风险/运行时/集成仪表盘。
6. 权限、匿名、可审计导出。
7. Dify 最小上下文、脱敏、授权评审、降级。
8. 钉钉矩阵与 Outbox 验证。
9. API/PostgreSQL/Web 跨层验证。
10. 最终门禁、双轴评审、推送、草稿 PR 或阻断项。

## 证据日志

| 门禁 | 证据 | 状态 |
|---|---|---|
| 阶段 5 基线 | 位于 `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5` 的远程分支 | 作为输入接受 |
| 阶段 3–5 复用 | 现有计划、台账、ADR、路线图与远程分支 | 作为输入接受 |
| 阶段 6 分支 | 从确切的阶段 5 最新提交创建 | 通过 |
| 基线文档/可视化 | 提交 `53a0985`；`git diff --check` 与 `corepack pnpm format:check` 退出 0 | 通过 |
| 行为事件/schema | 提交 `66c3f5`；契约 2/2；真实 PostgreSQL 数据库命令 3 个文件/21 个测试；contracts/database/server typecheck 与 server lint 通过 | 通过 |
| 每日聚合/指标字典 | server 定向命令 16 个文件/72 个测试；typecheck/lint 通过；重建服务使用 180 天原始事件窗口与固定字典 | 通过 |
| 固定仪表盘 | 提交 `fdc06e3`、`f86f7d6`；server 18 个文件/76 个测试；Web 4 个文件/18 个测试；server/web typecheck 与 lint 通过 | 通过 |
| 带权限的可审计导出 | 提交 `2da4a89`、`5608f41`；server 导出测试与 Docker 支持 schema 测试通过 | 通过 |
| Dify 边界 | server 20 个文件/82 个测试；server/API typecheck 与 server lint 通过；假提供方脱敏/授权/降级测试通过 | 通过 |
| 钉钉/Outbox 矩阵 | 提交 `de9e1ab`；server/worker/Docker 支持测试通过 | 通过 |
| API/PostgreSQL/Web e2e | 提交 `da8ac75`；API 10 个文件/19 个测试与 Web 4 个文件/18 个测试通过 | 通过 |
| 最终门禁/双轴评审 | 首轮评审可执行发现项已修复；全新的最终门禁与第二轮评审待办 | 进行中 |
| GitHub 推送/草稿 PR | 阶段 6 未尝试 | 待定/外部 |

## 分步证据

本节在每个有序步骤后更新，记录确切的命令、结果、提交与阻断项。任何步骤都不会凭未执行或推断的结果标记为通过。

### 步骤 1：基线与规划

- 分支：从阶段 5 提交 `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5` 创建。
- 远程证据：本地与 `origin/feature/phase-05-ai-demand-innovation` 都解析到 `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`；远程台账记录阶段 5 完整门禁与双轴评审通过，草稿 PR 被 HTTP 403/网络重置阻断。
- 文档：建立阶段 6 计划、执行台账、ADR 0007 与可视化更新；仪表盘中阶段 6 进度为 5%。
- 验证：`git diff --check` 退出 0；`corepack pnpm format:check` 退出 0。
- 提交：`53a0985 docs(phase-06): establish analytics dashboard assistant plan`。

### 步骤 2：行为事件、迁移、保留与审计边界

- RED：`packages/contracts/src/analytics.test.ts` 因 `analytics.ts` 缺失而失败；首次 Docker 支持数据库尝试以 `Could not find a working container runtime strategy` 失败，直到使用经授权的 Docker Desktop Linux 引擎。
- GREEN：契约测试 2/2 通过；Docker 支持命令 `corepack pnpm --filter @ai-hub/database test -- src/analytics-schema.integration.test.ts` 以 3 个文件/21 个测试通过，包括新的 3/3 分析 schema 测试、现有 demand 3/3 与 outbox 15/15。`@ai-hub/contracts` typecheck、`@ai-hub/database` typecheck、`@ai-hub/server` typecheck、`@ai-hub/server` lint 与 server 定向命令以 15 个文件/70 个测试通过。
- Schema：迁移 `0008_analytics_events` 新增允许列表原始事件，含 180 天过期、幂等、受众上下文、每日聚合键、指标定义元数据、只追加分析审计、带显式保留任务逃逸的删除保护与索引。未新增 `tenant_id`。
- 边界：`AnalyticsEventService` 校验事件，并在一个仓库事务中记录原始事件、审计行与 Outbox 事件；幂等重放不会产生重复的审计/outbox 行。
- 提交：`66c3f5 feat(phase-06): add behavior event and retention schema`。

### 步骤 3：每日聚合、重建与指标字典

- RED：`aggregation.service.test.ts` 因聚合服务与指标字典缺失而失败。
- GREEN：`corepack pnpm --filter @ai-hub/server test -- src/analytics/aggregation.service.test.ts` 以 16 个文件/72 个测试通过；`@ai-hub/server` typecheck 与 lint 通过；`git diff --check` 退出 0。
- 实现：原始事件按幂等键去重，限制在保留的 180 天窗口内，按 UTC 日与受众范围分桶，并确定性 upsert 到每日聚合。固定指标字典记录源事件、公式、时间范围、权限、受众规则与重算方法。
- 真实 PostgreSQL 聚合 e2e：推迟到步骤 9 的跨层验证；缓存结果不作为证据。
- 提交：`eb4a4ee feat(phase-06): add rebuildable daily analytics`。

### 步骤 4：平台、市场、应用与创新仪表盘

- RED：`dashboard.service.test.ts` 因仪表盘服务与固定权限映射缺失而失败；Web 路由测试随后因没有 `/analytics` 路由而失败。
- GREEN：server 仪表盘命令以 17 个文件/75 个测试通过；Web 阶段 6 命令以 4 个文件/18 个测试通过；server 与 Web 的 typecheck/lint 通过。
- 实现：固定仪表盘键只从每日聚合读取允许的指标键，在查询前拒绝未授权操作者，对非运营人员应用部门范围，将范围限制在 180 天内，并只输出固定指标。Web 暴露带核心与治理仪表盘标签的只读聚合外壳。
- 提交：`fdc06e3 feat(phase-06): add core analytics dashboards`。

### 步骤 5：评审、部门、风险、运行时与集成仪表盘

- RED：`dashboard-matrix.test.ts` 因固定仪表盘列表 API 缺失而失败。
- GREEN：server 命令以 18 个文件/76 个测试通过；server typecheck 与 lint 通过。
- 实现：暴露稳定的九键仪表盘矩阵，并验证每个治理/部门/风险/运行时/集成指标都有源事件、公式、权限、受众与重算元数据。未改变生命周期或通知语义。
- 提交：`f86f7d6 feat(phase-06): add governance and operations dashboards`。

### 步骤 6：权限过滤、匿名与可审计的后台导出

- RED：`export.service.test.ts` 因导出服务缺失而失败；新的 PostgreSQL 导出任务断言随后因 `analytics_export_jobs` 缺失而失败。
- GREEN：server 导出命令以 19 个文件/79 个测试通过；`@ai-hub/server` 与 `@ai-hub/database` 的 typecheck/lint 通过；Docker 支持数据库命令以 3 个文件/22 个测试通过，其中分析 schema 4/4；API 契约加继承的真实 PostgreSQL 回归在 Docker Desktop Linux 引擎下以 9 个文件/18 个测试通过。
- 实现：迁移 `0009_analytics_exports` 存储有界的导出任务生命周期；仓库只查询操作者范围内的每日聚合；服务在读取前拒绝未授权/超长范围，投影匿名/脱敏身份，并审计已请求/已完成/已失败/已下载动作。路由仍位于 `/internal/analytics` 下，带身份头与授权。
- 提交：`2da4a89 feat(phase-06): add audited analytics exports`；后续测试覆盖提交 `5608f41 test(phase-06): cover audited export service`。

### 步骤 7：Dify 最小上下文、脱敏、授权评审与降级

- RED：`assistant.service.test.ts` 因助手服务与 Dify 边界缺失而失败。
- GREEN：server 定向命令以 20 个文件/82 个测试通过；server/API typecheck 与 server lint 通过；假提供方测试证明员工编号、内部 URL、文件、二维码与匿名身份被排除在出站载荷之外，被拒绝的请求不会调用 Dify，提供商失败返回带审计的安全本地降级。
- 实现：`AnalyticsAssistantService` 使用显式授权评审仓库、允许列表的最小上下文、依赖注入的 `DifyAssistantPort`，且没有公开 Open API。在外部凭据单独授权前，生产使用提供商不可用的降级。
- API 路由装配由阶段 6 API 契约覆盖；Docker 支持 API 命令以 9 个文件/18 个测试通过，包括受防护的助手路由。
- 提交：`0a8d288 feat(phase-06): add guarded external assistant boundary`。

### 步骤 8：钉钉通知矩阵与 Outbox 投递验证

- RED：固定钉钉场景矩阵与事务后 Outbox 处理器缺失；首次 server 运行因新处理器模块不存在而失败。
- GREEN：`@ai-hub/server` 以 22 个文件/87 个测试通过，typecheck、lint 与 format check 通过；`@ai-hub/worker` 以 3 个文件/5 个测试通过，typecheck 与 lint 通过；Docker 支持数据库测试以 3 个文件/22 个测试通过。定向处理器测试证明提供商调用只发生在已认领的 Outbox 处理器中，投递失败记录 `retry` 并抛出安全重试码，矩阵元数据携带场景、收件人角色与操作者上下文。
- 实现：固定的 14 场景阶段 3–6 矩阵通过 `NotificationModule` 暴露；矩阵入队复用 `NotificationService` 的授权/幂等/事务边界，丰富 Outbox 载荷元数据，拒绝敏感模板变量，且绝不在业务事务内调用钉钉。处理器是 Outbox 后的钉钉端口边界并保留重试状态。
- 可视化：`processing_visualization.html` 将阶段 6 记录为 65%，含已实现工作与待办跨层/最终门禁。
- 提交：`de9e1ab feat(phase-06): complete DingTalk work notification matrix`。

### 步骤 9：API、PostgreSQL e2e、Web 路由、权限、审计、导出与助手

- RED：不存在真实的阶段 6 跨层证据；首次测试补充建立了真实 PostgreSQL/API 夹具，并暴露出需要断言提供商载荷与通知 Outbox 投递。
- GREEN：Docker 支持 `@ai-hub/api` 运行以 10 个文件/19 个测试通过，包括新的真实阶段 6 e2e；它证明了原始事件幂等、每日重建值 2、受保护的仪表盘/导出/助手路由、导出与助手审计行、Dify 允许列表脱敏，以及带 `sent` 通知状态与审计元数据的真实 Outbox 到钉钉投递。Web 以 4 个文件/18 个测试通过且 typecheck/lint 通过；API typecheck/lint 与 format check 通过。
- 实现：未新增公开 Open API；真实 e2e 将现有已认证内部路由边界与 PostgreSQL 支持的分析仓库及现有 worker/Outbox 处理器组合起来。Web 路由仍是只读固定仪表盘外壳。
- 提交：`da8ac75 test(phase-06): verify analytics dashboard export assistant flows`。

### 步骤 10：最终门禁前的评审修复

- 双轴评审使用完整阶段 6 diff 针对阶段 5 固定点 `4a6e9e4` 运行。两个轴都发现了可执行项；任何一项都不被接受为延后的实施风险。
- 修复：新增保留服务与审计边界；让每日重建在替换前删除目标聚合范围；对全部 12 个指标定义进行版本化与持久化；新增评审 SLA、需求举报、助手失败与通知重试事件源；将应用、需求、评审、导出、助手与通知路径接入行为事件记录；新增逐行导出策略审计与下载所有权检查；新增仪表盘读取审计/Outbox 记录；净化助手问题并强制指标受众角色；持久化钉钉投递错误状态；去重仪表盘指标映射；记录迁移 `0008` 与排序的导出扩展 `0009`。
- TDD 证据：server 测试现在以 23 个文件/92 个测试通过；契约测试 2/2 通过；server typecheck 与依赖边界通过。应用评审事件有定向服务断言；保留、助手、导出、仪表盘、通知与处理器测试覆盖其余修复边界。
- 提交：待修复 diff 被独立验证并提交后进行。

### 步骤 10b：第二轮评审修复

- 第二轮双轴评审在运行时保留执行、保留范围强制、受众字段、分析 RBAC 配置、缺失生产者、SLA 扫描行为、导出/助手 Outbox、拒绝审计、Dify 对抗性脱敏/降级、指标版本传播与钉钉收件人授权方面发现可执行缺口。
- RED：在实现前新增定向范围、导出拒绝/Outbox、助手边界、worker 保留、角色/指标版本 schema 与通知授权断言。
- GREEN：server 以 24 个文件/96 个测试通过；worker 以 3 个文件/6 个测试通过；database 以 3 个文件/24 个测试通过，包括 `0010` 角色种子、`0011` 聚合版本列与保留函数安全元数据；server/database/worker/API 的 typecheck 与依赖边界通过。
- 实现现在在现有 worker 中调度保留与逾期评审扫描，应用统一的 180 天范围策略，持久化资源受众字段，为下载/点赞/评论生产者埋点，发出导出/助手 Outbox 生命周期，审计拒绝，约束并脱敏 Dify 字符串，将指标版本带入聚合，配置分析角色，并通过 IdentityService 角色记录授权钉钉收件人。
- 提交：待真实 API/数据库回归与新一轮双轴评审在本修复上通过后进行。

### 步骤 10c：最终边界加固

- RED：评审后续暴露出被拒绝导出审计可能随被拒事务一起回滚、助手遥测失败可能阻断已授权提供商调用、worker 未注册业务通知处理器、保留触发器接受伪造的会话 GUC、通知矩阵默认使用非资源感知的授权器。
- GREEN：定向 server 测试以 24 个文件/98 个测试通过；server/database/worker 的 typecheck、lint、format check 与依赖边界通过。Docker 支持 PostgreSQL 以 3 个文件/24 个测试通过；真实 API 以 10 个文件/19 个测试通过；Worker 以 3 个文件/7 个测试通过。
- 实现：拒绝生命周期审计/outbox 在导出事务之外运行；仪表盘/导出读取包含部门与员工受众范围及当前指标版本；Dify 脱敏覆盖内部主机名、员工短语、UNC 路径与中文等价形式，同时审计与 Outbox 遥测独立降级；保留删除验证 `SECURITY DEFINER` 属主并拒绝未来截止时间；Worker 注册 `notification.created`；生产钉钉授权同时解析角色与聚合资源所有权；格式错误的通知载荷在处理器边界被拒绝。
- 提交：待最终精确门禁、本地双轴审计、推送与草稿 PR 状态记录后进行。

### 步骤 11：最终门禁与交付证据

- 使用 Docker Desktop Linux 引擎的最终精确门禁命令通过：`corepack pnpm format:check`、`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm boundaries`、`corepack pnpm test`、`corepack pnpm build`、`node scripts/verify-doc-links.mjs` 与 `docker compose -f compose.yaml -f compose.test.yaml config --quiet`。
- 完整测试证据：15 个 Turbo 任务通过；database 3 个文件/24 个测试、server 24 个文件/98 个测试、API 10 个文件/19 个测试、Web 4 个文件/18 个测试、Worker 3 个文件/7 个测试。构建只带先前存在的前端 chunk 体积警告完成。
- 后续审计针对最终边界加固 diff 重新检查了前两轮标准/规格评审的每个发现项；无可执行发现项遗留。未改变阶段 3–5 业务语义，未引入 tenant_id 或被禁止的基础设施，阶段 7 仍延后。
- 提交：`5ccc132 fix(phase-06): harden final analytics boundaries`。
- 剩余外部交付证据：分支推送与草稿 PR 状态。

### 步骤 12：远程交付状态

- 推送通过：`origin/feature/phase-06-analytics-dashboard-export-assistant` 现指向 `92b56e8`。
- 已通过配置的 GitHub 集成以 `main` 为基尝试创建草稿 PR，GitHub 的 create-pull-request 端点返回 HTTP 403：`Resource not accessible by integration`。没有 PR 编号或 URL 被视为既有证据。分支位于 `https://github.com/lzc452/AI-HUB-PLATFORM/tree/feature/phase-06-analytics-dashboard-export-assistant`。
- 这是外部权限阻断项，不是实现或门禁失败；需要人工 GitHub 权限或草稿 PR 创建。
