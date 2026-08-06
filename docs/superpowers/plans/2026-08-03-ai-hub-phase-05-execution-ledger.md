# 阶段 5 执行台账

日期：2026-08-03

## 基线决策

阶段 4 作为阶段 5 输入，从远程分支 `feature/phase-04-market-search-interaction` 的提交 `f60def66699bfbb0192b60fa1d256d98159d198b` 接受。阶段 3 证据仍从 Codex 会话 `019fc537-5ae6-7f42-bb49-ff0fc969afac` 接受。阶段 5 在实施前不重跑阶段 3 或阶段 4 完整门禁。

阶段 5 分支为 `feature/phase-05-ai-demand-innovation`。现有未跟踪的 `.codex/` 是用户拥有的工作区状态，被排除在暂存之外。

## 范围与非目标

阶段 5 交付结构化 AI 需求、草稿、轻量评审、受众过滤、匿名呈现、点赞、讨论、举报、认领/所有权、协作者、运营人员选择、可解释优先级、状态/进度/试点/关闭工作流、合并与应用关联、主解决方案以及正式应用列出的桥接。阶段 6 仪表盘、导出、Dify 外部助手与指标字典仍明确延后。禁止 Redis、Elasticsearch、消息队列、Kubernetes、微服务、公开 Open API、物理删除与新的租户模型。

## 有序执行

1. 基线、计划、台账、ADR、可视化。
2. 契约、迁移、状态/受众/审计边界。
3. 创建、草稿、轻量评审、驳回。
4. 列表/详情、受众与匿名展示、点赞、讨论、举报。
5. 认领、所有者、协作者、运营人员选择、并发。
6. 价值/成本/风险/管理员优先级与可解释排序。
7. 状态推进、官方进度、试点、关闭。
8. 合并、多对多应用、主解决方案、正式列出桥接。
9. API/Web/PostgreSQL e2e、最终门禁、双轴评审。
10. 提交、推送、草稿 PR 交接。

## 证据日志

| 门禁 | 证据 | 状态 |
|---|---|---|
| 阶段 3 基线 | Codex 会话 `019fc537-5ae6-7f42-bb49-ff0fc969afac` | 作为输入接受 |
| 阶段 4 基线 | 位于 `f60def66699bfbb0192b60fa1d256d98159d198b` 的远程分支 | 作为输入接受 |
| 阶段 5 分支 | 从阶段 4 HEAD 创建 `feature/phase-05-ai-demand-innovation` | 已记录 |
| 计划/ADR/台账/可视化 | 阶段 5 基线文档与仪表盘条目；分支从确切阶段 4 HEAD 创建 | 通过 |
| 契约/schema | `@ai-hub/contracts` 与 `@ai-hub/database` typecheck 通过；PostgreSQL 迁移测试 3/3，现有 outbox 15/15 通过 | 通过 |
| 需求生命周期 | 服务 59/59 与 API 14/14 定向包测试通过；受保护的 create/submit/review 路由已覆盖 | 通过 |
| 创新互动 | Server 62/62；Web 17/17；Docker 支持 API 8 个文件/15 个测试；PostgreSQL schema 3/3 加 outbox 15/15 | 通过 |
| 所有权/优先级/进度 | 所有权、优先级与进度：server 66/66；Docker 支持 API 8 个文件/16 个测试；PostgreSQL schema 3/3 加 outbox 15/15 | 通过 |
| 合并/应用闭环 | Server 68/68；定向 mock API 需求套件 1/1；Docker 支持阶段 5 真实 API 3/3，现有应用生命周期 3/3 | 通过 |
| PostgreSQL/API/Web 证据 | Docker 支持阶段 5 真实 API 3/3；应用生命周期 3/3；Web 17/17；完整 workspace 测试：API 17 个、server 68 个、database 18 个 | 通过 |
| 最终门禁/双轴评审 | 所有必需的最终命令通过；收尾后完成双轴评审 | 通过 |
| GitHub 推送/草稿 PR | `git push --set-upstream origin feature/phase-05-ai-demand-innovation` 重试两次并被 GitHub 重置；草稿 PR 连接器返回 HTTP 403 `Resource not accessible by integration` | 被外部网络/集成权限阻断；未完成 |

## 决策与风险

- 应用发布仍由现有阶段 3 应用服务负责；需求模块可以创建并关联应用工作，但不能直接发布应用。
- 受众检查在分页之前、详情或动作响应之前执行。匿名标记只影响呈现。
- 乐观版本检查与唯一/部分索引保护认领、合并、状态与主解决方案竞争；被拒绝的竞争是显式冲突。
- 所有非破坏性治理记录仍可被授权的审计查询。
- 真实的外部通知凭据与阶段 6 分析按范围延后，不视为阶段 5 完成证据。

## 分步证据

本节在每个有序步骤后更新，记录确切的测试命令、结果、提交与任何阻断项。任何步骤都不会凭未执行或推断的结果标记为通过。

### 步骤 1：基线与规划

- 分支检查：当前阶段 4 HEAD 为 `f60def66699bfbb0192b60fa1d256d98159d198b`，跟踪状态干净；`.codex/` 保持未跟踪且被排除。
- 分支创建：从该 HEAD 创建 `feature/phase-05-ai-demand-innovation`。
- 文档：计划、台账、ADR 0006 与 `processing_visualization.html` 已更新。
- 验证：`git diff --check` 与 `corepack pnpm format:check` 均退出 0。
- 提交：`76cc835 docs(phase-05): establish AI demand innovation plan`。

### 步骤 2：契约、迁移与边界

- RED：在 `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine` 下，新迁移测试因所有阶段 5 表/约束缺失而失败；首次无引擎尝试记录为环境阻断项。
- GREEN：`corepack pnpm --filter @ai-hub/contracts typecheck` 退出 0；`corepack pnpm --filter @ai-hub/database typecheck` 退出 0；定向 PostgreSQL 命令退出 0，3 个需求 schema 测试与 15 个现有 outbox 集成测试通过。
- Schema：新增迁移 `0006_ai_demand_innovation`，包含规范化生命周期、受众、协作、评论、举报、进度、试点、应用关联、审计、乐观版本、部分主解决方案索引、需求点赞与非破坏性删除触发器。未新增 `tenant_id`。
- 提交：`dba35ec feat(phase-05): add demand contracts and schema`；遗漏的需求点赞表在任务 3 前被发现，并在下一个定向修复提交中修正。

### 步骤 3：需求创建、草稿、轻量评审与驳回

- RED：服务测试最初因 `demand.service.js` 不存在而失败。首次实现运行还暴露了无效的 `allowAll` 评审人夹具与 exact-optional TypeScript 错误；两者均已修正。
- GREEN：`corepack pnpm --filter @ai-hub/server test -- src/demand/demand.service.test.ts` 以 59/59 通过 workspace server 测试；`corepack pnpm --filter @ai-hub/server typecheck` 退出 0；`corepack pnpm --filter @ai-hub/api typecheck` 退出 0；Docker Desktop 支持的 API 命令以 7 个文件/14 个测试通过，包括新的受保护需求端点测试与现有真实应用生命周期。
- 实现：新增需求服务/仓库/控制器/模块、草稿校验、需求方/评审人 RBAC、乐观状态调用、事务性配对的审计/outbox 调用，以及 create/save/submit/review 的 API 路由。
- 提交：`9c369aa feat(phase-05): add governed demand submission`。

### 步骤 4：需求列表/详情、受众、匿名展示、互动与举报

- RED：互动服务测试最初因需求互动方法与 Web 创新路由缺失而失败。治理测试随后失败，直到被举报评论显式隐藏/恢复；真实 API e2e 暴露出需要让评审人保持在授权受众内，并允许在不受禁止删除触发器约束的情况下移除点赞。
- GREEN：`corepack pnpm --filter @ai-hub/server typecheck` 与定向 server 测试以 62/62 通过 workspace 测试；`corepack pnpm --filter @ai-hub/api typecheck` 通过；Web typecheck 通过，定向 Web 套件 17/17 通过；Docker 支持的 `phase5.real.e2e-spec.ts` 以 8 个文件/15 个测试通过（含现有应用生命周期 e2e）；Docker 支持的 schema 命令以 3 个需求 schema 测试加 15 个 outbox 测试通过。
- 实现：仓库谓词在分页前应用受众过滤；匿名身份仅在输出时投影，授权查询会被审计；点赞幂等，讨论单层且只追加，举报通过 `hidden_at` 支持隐藏/恢复，每次变更都以事务方式写入审计/outbox 记录。点赞表刻意可删除，因为点赞是可逆反应，不属于无物理删除要求覆盖的需求/讨论/举报/关联内容。
- 提交：`02ee2c0 feat(phase-05): add demand square interactions`。

### 步骤 5：认领、所有者、协作者、运营人员选择与并发

- RED：服务测试最初因 `claim` 与 `addCollaborator` 缺失而失败；API 契约测试随后以 404 失败，直到添加认领/协作者路由；schema 集成测试因单运营人员索引缺失而失败；协作者列表测试在实现前暴露了缺失的读取路径。无 Docker 的 API 尝试只记录为运行时阻断项，不作为通过证据。
- GREEN：`corepack pnpm --filter @ai-hub/server typecheck` 通过，定向 server 命令以 64/64 通过 workspace 测试；`corepack pnpm --filter @ai-hub/api typecheck` 通过；Docker 支持的 API 测试以 8 个文件/16 个测试通过，包括两个真实阶段 5 测试证明单一并发认领获胜者与一次运营人员分配；Docker 支持的数据库命令以 3 个需求 schema 测试加 15 个 outbox 测试通过。
- 实现：新增乐观所有者认领、仅所有者协作者与运营人员分配、唯一协作者冲突映射、协作者列表、事务性配对的审计/outbox 事件，以及带部分唯一运营人员索引的迁移 `0007`。认领与分配都以条件方式更新需求版本，因此过期写入者以 `DEMAND_CONFLICT` 失败。
- 提交：`17c0831 feat(phase-05): protect demand ownership concurrency`。

### 步骤 6：可解释的价值/成本/风险/管理员优先级与排序

- RED：新的优先级服务测试因 `setPriority` 缺失而失败。契约测试随后要求显式 API 路由与列表排序路径。
- GREEN：`corepack pnpm --filter @ai-hub/server typecheck` 通过，定向 server 命令以 65/65 通过 workspace 测试；`corepack pnpm --filter @ai-hub/api typecheck` 通过；Docker 支持的 API 测试以 8 个文件/16 个测试通过，包括管理员优先级持久化与 `sort=priority`；真实 PostgreSQL 路径配合现有 schema/outbox 证据通过。
- 实现：输入为 1..5 的整数有界；固定可解释分数为 `3*businessValue + 2*adminPriority - 2*implementationCost - 2*riskLevel`；解释被持久化并审计，乐观版本保护更新，只有 `demand_operator`/`super_admin` 可以写入或请求优先级排序。PostgreSQL 排序使用分数降序、创建时间降序与需求 ID 升序作为确定性决胜规则。
- 提交：`3c2ca1c feat(phase-05): add explainable demand prioritization`。

### 步骤 7：状态推进、官方进度、试点与关闭

- RED：进度服务测试最初因 `advanceStatus` 缺失而失败。API 契约随后演练了状态、进度、试点创建与试点更新路由。
- GREEN：`corepack pnpm --filter @ai-hub/server typecheck` 通过，定向 server 命令以 66/66 通过 workspace 测试；`corepack pnpm --filter @ai-hub/api typecheck` 通过；Docker 支持的 API 测试以 8 个文件/16 个测试通过，包括真实 PostgreSQL 状态推进、官方进度、试点日期/更新与关闭原因路径。
- 实现：显式状态图阻止回退/终态改写；状态变更使用现有乐观版本迁移，进度只追加，试点记录保留结果/状态历史字段，每次状态/进度/试点变更都在同一事务中发出审计与 Outbox 条目。关闭必须填写原因。
- 提交：`c2e58c0 feat(phase-05): add demand progress and pilot lifecycle`。

### 步骤 8：合并、应用关联、主解决方案与正式应用桥接

- RED：新服务测试最初因 `createApplicationFromDemand` 缺失而失败。API 契约随后要求合并、多对多关联、应用列表与桥接路由。
- GREEN：`corepack pnpm --filter @ai-hub/server typecheck` 与 `corepack pnpm --filter @ai-hub/api typecheck` 通过；定向 server 命令以 68/68 通过；定向 mock API 需求套件 1/1 通过；Docker 支持的 `phase5.real.e2e-spec.ts` 以 3/3 通过；现有 Docker 支持的 `application.real.e2e-spec.ts` 以 3/3 通过。
- 实现：合并使用条件性的源与目标版本更新；应用关联为多对多，带数据库强制的主解决方案不变量与确定性列表；每次合并/关联变更在需求事务中记录审计与 Outbox。桥接现在让应用草稿创建、需求关联、版本更新与两个模块的审计/Outbox 记录共享同一个 PostgreSQL 事务。主解决方案要求关联应用已发布；现有候选关联可在阶段 3 生命周期门禁后提升。带 `includeChildren` 的部门受众在分页/详情/动作可见性检查前递归使用部门层级。真实 e2e 通过现有阶段 3 应用路由完成制品校验、全部四个交付渠道、评审与发布；需求服务绝不直接写入应用发布状态。
- 提交：`36ebf76 feat(phase-05): close demand to application loop`、`ff90b75 fix(phase-05): make application bridge atomic`、`2df8a63 fix(phase-05): honor hierarchical demand audiences` 与 `5e4fe9e fix(phase-05): gate primary solutions on publication`。

### 步骤 9：最终门禁与双轴评审

- 定向证据：`corepack pnpm --filter @ai-hub/server test -- src/demand/demand.service.test.ts` 以 68/68 通过；API 需求契约 1/1 通过；Docker 支持的 `phase5.real.e2e-spec.ts` 3/3 通过，现有 `application.real.e2e-spec.ts` 3/3 通过；Web 定向套件 17/17 通过。
- 最终门禁命令全部退出 0：`corepack pnpm format:check`、`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm boundaries`、`corepack pnpm test`、`corepack pnpm build`、`node scripts/verify-doc-links.mjs` 与 `docker compose -f compose.yaml -f compose.test.yaml config --quiet`。Compose 命令只输出了本地 Docker 配置权限警告，返回 `exit=0`。
- 完整测试证据包括 API 8 个文件/17 个测试、server 14 个文件/68 个测试、database 2 个文件/18 个测试、Web 3 个文件/17 个测试、worker 3 个文件/5 个测试，以及仓库 Node 检查 8/8。
- 双轴评审针对 `f60def66699bfbb0192b60fa1d256d98159d198b` 在完整非空分支 diff 上运行。发现项与处置记录在下方收尾说明中；不存在未解决的可执行发现项。

#### 双轴评审处置

- 标准轴：唯一硬性发现是非原子应用桥接；已在 `ff90b75` 修复。报告的发散变更、重复事务编排与控制器输入数据块（data clump）属于有据可查的 Fowler 代码味道判断，不构成阻断门禁的违规。
- 规格轴：非原子桥接已在 `ff90b75` 修复；层级 `includeChildren` 受众可见性已实现并由真实 PostgreSQL e2e 覆盖（`2df8a63`）；草稿应用不能被选为主解决方案，现有关联可在发布后提升（`5e4fe9e`）。无范围蔓延发现项残留。

### 步骤 10：GitHub 交接

- 在此阻断说明之前，本地分支与提交状态在 `40e0d3e` 就绪；工作树只包含先前存在的未跟踪 `.codex/` 目录，其余干净。
- 使用确切分支名尝试了两次推送，两次都以 `fatal: unable to access ... Recv failure: Connection was reset` 失败。
- 对 `lzc452/AI-HUB-PLATFORM` 以 `main` 为目标尝试了已连接的 GitHub 草稿 PR 操作，返回 HTTP 403：`Resource not accessible by integration`。未获得 PR URL 或远程分支更新。这一外部交接仍未完成，不构成阶段 5 完成声明。
