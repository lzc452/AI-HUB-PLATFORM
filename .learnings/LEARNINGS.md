# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20260828-001] best_practice

**Logged**: 2026-08-28T00:00:00Z
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
通知事件类型（eventType）必须单一来源：以 `DINGTALK_NOTIFICATION_MATRIX`（点号命名空间，如 `application.review.decided`）为权威，demo 种子 fixture、前端分类映射、worker 处理器不得自造变体命名（如旧 fixture 的下划线 `application.review_decided`）。

### Details
`docs/notification-mock-audit.md` 记录了三套互相不一致的 taxonomy：后端矩阵（点号命名）、旧 fixture（下划线命名）、前端 `.includes()` 兜底分支。直接后果是 seed 数据与真实业务事件命名漂移，前端分类依赖字符串 includes 兼容，出现"8/20 落入兜底分类"的展示问题。修复方向：统一 fixture eventType 到矩阵命名，前端 meta 按矩阵命名映射，测试以矩阵为权威清单。

### Suggested Action
- 修改种子 fixture 时先对照 `DINGTALK_NOTIFICATION_MATRIX` 校验命名；
- 新增通知场景必须先入矩阵，再接线业务服务，再补前端 meta 分支与测试；
- 审查阶段 grep 检查是否存在矩阵之外的 eventType 字面量。

### Metadata
- Source: conversation
- Related Files: packages/server/src/notification/dingtalk-matrix.service.ts, packages/database/src/demo-data/fixtures/notification.fixture.ts, apps/web/src/modules/notification/notificationMeta.ts
- Tags: notification, taxonomy, naming
- Pattern-Key: notification.taxonomy_single_source

### Resolution
- **Resolved**: 2026-08-29
- **Notes**: 通知系统完整交付（团队 notification-complete）已统一：fixture eventType 对齐矩阵命名（t5）、前端 meta 按矩阵映射（t4）、授权器/矩阵单一权威（t11 审查确认）。

---

## [LRN-20260829-001] best_practice

**Logged**: 2026-08-29T00:00:00Z
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
矩阵通知场景接线后必须核对收件人授权器（authorizeDingTalkResource）与收件人语义的一致性：授权器的资源过滤条件可能比矩阵收件人规则更严格，导致合法收件人被拒（NOTIFICATION_RECIPIENT_NOT_AUTHORIZED 被调用方吞掉，表现为"通知丢失"）。

### Details
`demand.collaborator_assigned` 场景：矩阵 recipientRole=demand_collaborator（"被分配至需求"的成员），但授权器限定 `role='collaborator'`，而 DemandCollaboratorRole 含 `operator`——operator 角色协作者收不到通知，且因 try/catch 吞异常无任何日志。审查（t11）发现后移除 role 过滤修复。

### Suggested Action
- 接线新场景后逐场景核对授权器过滤条件（角色值域、资源归属字段、aggregateId 语义）；
- 收件人授权被拒时应有可观测性（当前静默吞掉，至少保留 debug 日志选项）。

### Metadata
- Source: conversation
- Related Files: packages/server/src/notification/notification.module.ts, packages/server/src/demand/demand.service.ts
- Tags: notification, authorization, recipient
- Pattern-Key: notification.authorizer_recipient_mismatch

---

## [LRN-20260829-002] best_practice

**Logged**: 2026-08-29T00:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
回归排查时优先区分"干净环境能否复现"：服务层与 HTTP 层（真实 testcontainers + 生产装配）全链路复现通过，说明"领取后审核失败"非代码回归，而是用户环境数据/构建差异——应索取具体错误详情而非盲目改码。可复现的展示缺陷（空数据源、缺交互组件、无效日期）直接修复。

### Details
- 审核链路（创建→提交→认领→审核）在干净容器全过（review-flow.e2e-spec.ts 转正为回归测试）；用户报告的失败需错误详情。
- 修复：MarketplaceSidebar 最近更新（空数组 → useCatalogSearch sort=latest）；详情页截图（img → antd Image+PreviewGroup）；审核工作台 formatDate 无效日期防御（"—"）。

### Metadata
- Source: conversation
- Related Files: apps/web/src/pages/marketplace/MarketplaceSidebar.tsx, apps/web/src/pages/marketplace/detail/MarketplaceDetailDescription.tsx, apps/web/src/pages/applications/ApplicationReviewPage.tsx, apps/api/test/review-flow.e2e-spec.ts
- Tags: regression, marketplace, review
- Pattern-Key: regression.reproduce_before_fixing

---
