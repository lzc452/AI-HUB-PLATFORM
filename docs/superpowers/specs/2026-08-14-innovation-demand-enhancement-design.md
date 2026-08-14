# 创新广场增强 · 现有架构梳理与分层实施设计

- 日期：2026-08-14
- 范围：创新广场交互（需求列表 / 发起新需求 / 需求流转 / 认领），前端 + 后端 + 数据库
- 前置：ADR 0006（阶段 5 AI 需求与创新广场边界）已建立需求模块基座

---

## 一、现有架构（现状梳理）

创新广场并非从零开始，`demand`（需求）有界上下文已完整就位，遵循 ADR 0006 的七条原则（规范化记录、复用受众模型、匿名为投影关注点、乐观锁、可解释优先级、不产生第二条发布路径、同事务审计+outbox）。

| 层 | 位置 | 现状 |
|---|---|---|
| 契约 | `packages/contracts/src/demand.ts` | `DemandStatus`（9 态）、`CreateDemandInput`、`DemandEntry`、`DemandPriorityInput` 等类型 |
| 数据库 | `packages/database/src/migrations/0006/0007/0014` | `ai_demands` 主表 + collaborators / likes / comments / reports / progress / pilots / applications / audit_events 共 9 张表，均有 `no_delete` 触发器（只追加不物理删除） |
| 后端 | `packages/server/src/demand/*` | service / controller / repository / dto / types，REST 端点挂 `@Controller("/internal/demands")`，RBAC 权限 `demand.*` |
| 前端 | `apps/web/src/pages/innovation/*` + `modules/innovation/*` | 列表页、创建抽屉、详情页（讨论/点赞/举报）、治理抽屉 |

**已实现能力**：列表（状态/关键词/部门/受众/排序/分页）、草稿+提交审核+审核(发布/驳回)、认领(直接)、协作者管理、4 维优先级评分、状态流转、进度更新、试点、合并、需求-应用多对多（candidate/pilot/solution + 主解决方案唯一索引）、点赞、一层评论+点赞、举报+处理、匿名审计、乐观锁 version、审计事件、Outbox。

---

## 二、差距分析（现有 vs 目标规格）

| # | 目标规格 | 现状 | 缺口 |
|---|---|---|---|
| A | 10 态状态机（草稿/待审核/待认领/已认领/方案验证中/试点中/已转化/已关闭 + 已驳回/已合并） | 9 态：`draft/pending_review/rejected/published/in_progress/pilot/completed/closed/merged` | 缺「待认领/已认领/方案验证中/已转化」语义；`published/in_progress/completed` 需对齐 |
| B | 9 组表单字段 | 仅 title / problemStatement / desiredOutcome / 受众 / 匿名 | 缺：业务场景、影响对象+频率+耗时、替代方案、数据类型与敏感度、附件/截图、AI 方案设想 |
| C | 认领方案制（多方案→管理员确认→指定负责人+协作者→可解除重开） | 直接认领 + 协作者，无「方案」概念 | 整条认领方案流缺失 |
| D | 优先级 7 维 + 建议分 + 管理员确认高/中/低 + 调整原因 | 4 维（业务价值/实施成本/风险/管理员优先级）+ 加权分 | 缺影响人数/使用频率/战略匹配度/技术可行性；缺高中低确认与调整原因 |
| E | 点赞不直接决定开发顺序 | 已满足（评分不含点赞） | 无 |

V1 明确不实现（需在代码注释/文档中标注排除）：创新积分、徽章、排行榜、物质激励、AI 自动审核、自动需求合并、自动评分。

---

## 三、分层实施计划

### 第 0 层 · 契约 + 数据库迁移（基础，无业务副作用）
1. `contracts/src/demand.ts`：
   - `DemandStatus` 重构为 10 态：`draft | pending_review | pending_claim | claimed | validating | pilot | converted | closed | rejected | merged`。
   - 扩展 `CreateDemandInput` / `DemandEntry`：新增 `businessScenario`、`impact`（影响对象/频率/耗时）、`currentWorkaround`、`dataSensitivity`、`aiSolutionIdea`、`attachmentAssetIds`。
   - 新增认领方案类型：`DemandClaimProposal`、`DemandClaimProposalInput`、`DemandClaimConfirmationInput`；状态 `proposed | selected | rejected | withdrawn`。
   - 扩展优先级：`DemandPriorityInput` → 7 维 + `confirmedPriority: high|medium|low` + `priorityAdjustmentReason`。
2. 新增 migration（`0028_demand_claim_proposal_and_priority.ts`）：
   - `ai_demands` 增列：`business_scenario`、`impact`、`current_workaround`、`data_sensitivity`、`ai_solution_idea`、`confirmed_priority`、`priority_adjustment_reason`；删除旧 `admin_priority`（并入 7 维，保留数据迁移）。
   - 新建 `ai_demand_claim_proposals`（proposal_id / demand_id / proposer / owner / collaborators / approach / estimated_validation_duration / resource_needs / preference / status / timestamps）。
   - 新建 `ai_demand_attachments`（demand_id / asset_id，复用统一上传 `kind=attachment`）。
   - 更新 `ai_demands_status_check` 约束为新 10 态。

### 第 1 层 · 后端服务（`packages/server/src/demand`）
1. 状态机对齐：更新 `statusTransitions` 与 `reviewableStatuses`，`review` 通过后进 `pending_claim`。
2. 表单字段：`normalizeInput` 校验 9 组字段；repository 读写新列。
3. 认领方案制：新增 `submitClaimProposal` / `listClaimProposals` / `withdrawClaimProposal` / `confirmClaim`（管理员选定→写 owner+collaborators+`claimed`）/ `releaseClaim`（解除重开→`pending_claim`）。
4. 优先级：`setPriority` 改 7 维加权公式 + `confirmPriority`（管理员确认高中低 + 调整原因）。
5. 附件：关联/解除附件接口（复用 `unified-upload.controller` 的 `kind=attachment`）。

### 第 2 层 · 前端（`apps/web/src/pages/innovation` + `modules/innovation`）
1. 列表页：状态枚举与筛选映射到新 10 态。
2. 发起需求：`CreateDemandDrawer` 改为分步表单（复用 `shared/forms/FormWizard`），9 组字段 + 附件上传。
3. 详情页：新增「业务场景/影响/替代方案/数据敏感度/AI 设想」展示区块、优先级 7 维雷达/指标、认领方案区（提交方案/多方案列表/管理员确认/解除）。
4. 治理抽屉：扩展审核→待认领、认领确认、解除认领、优先级确认等操作。

### 第 3 层 · 验证与收尾
- 逐层 `typecheck` / `build` / `test`；新增认领方案与优先级 7 维的服务单测与 DB 集成测试；更新 demo 种子数据；更新 `docs/flowchart/04-innovation-demand-loop`。

---

## 四、关键设计决策（待确认）

1. **状态机映射**：`published→pending_claim`（待认领）、`in_progress→claimed`（已认领）、`completed→converted`（已转化）、新增 `validating`（方案验证中）。迁移采用「旧值重命名」+ 更新 check 约束。
2. **优先级 7 维建议权重**（1–5 分，风险/成本反向）：
   `score = 0.20·业务价值 + 0.15·影响人数 + 0.10·使用频率 + 0.15·战略匹配度 + 0.10·技术可行性 + 0.15·(6−数据合规风险) + 0.15·(6−实施成本)`。
3. **认领方案制**：任意正常员工（`demand.claim`）可提交方案；管理员（`demand.manage`）从多方案中确认；确认后写 `owner` + `collaborators` 并置 `claimed`；`releaseClaim` 清空并回 `pending_claim`。
4. **附件**：复用既有统一上传（`kind=attachment`），需求侧只存 `asset_id` 关联，不重复造上传链路。

---

## 五、待用户确认

1. 本轮推进方式：一次性逐层完整实现 vs 先出核心闭环（10 态 + 9 组字段 + 认领方案 + 7 维优先级）附件与既有讨论/试点/合并保持现状。
2. 优先级 7 维权重公式是否采用上文默认值。
