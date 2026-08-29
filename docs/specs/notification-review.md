# 通知系统整体审查报告（t11）

> 审查人：captain（接管 reviewer t11）｜ 日期：2026-08-29 ｜ 基准：docs/specs/notification-system.md
> 双轴：Spec（21 场景接线/已读未读/真实数据/Portal 契约）与 Standards（错误处理/命名/测试质量/异味）

## 审查结论：PASS（1 个阻塞前问题已修复）

## 一、Spec 轴

| 检查项 | 结论 | 证据 |
|---|---|---|
| 21 场景接线完整性 | ✅ 21/21 | t8 报告 §2 静态核对（grep 定位）+ server 476 测试 queue 参数断言 |
| 广播语义（demand.submitted/review.requested） | ✅ | demand.service 循环广播 + application 广播端口；单条失败不阻断其余（测试覆盖） |
| 已读未读功能 | ✅ | summary/read-all/点击即读/批量/30s 轮询；notification 域 24/24 + web NotificationsPage 8/8 |
| 真实数据渲染 | ✅ | 硬编码演示字段零残留（负向断言） |
| Portal 契约 | ✅ | t9 契约核对 4/4 一致 + 文档 v1.4 |
| 幂等与事务边界 | ✅ | 幂等键 eventType:aggregateId:recipient；queue 在事务后 try/catch 不阻断业务 |

## 二、Standards 轴

| 检查项 | 结论 | 证据 |
|---|---|---|
| 错误处理 | ✅ | 全部 queue 调用独立 try/catch；export 失败不掩盖原错误 |
| 命名/taxonomy 统一 | ✅ | 矩阵为单一权威；fixture 对齐（t5）；无新变体命名 |
| 测试质量 | ✅ | TDD 红→绿；断言收件人/aggregateId/variables 参数；无 tautological |
| 代码异味 | ✅ | 无新增重复/死代码/魔法字符串；存量问题已清理（t8 §4） |

## 三、发现与处置

| # | 严重度 | 问题 | 处置 |
|---|---|---|---|
| R1 | medium（已修复） | `demand_collaborator` 授权器限定 `role='collaborator'`，但 DemandCollaboratorRole 含 `operator`——以 operator 角色分配的协作者收不到 `demand.collaborator_assigned`（授权拒绝被吞） | notification.module.ts 授权器移除 role 过滤（两类角色均视为需求协作者）；server 476/476 回归通过 |
| R2 | low（披露，存量） | `application.review.sla.overdue` 的 recipientRole `application_admin` 不在授权器 aliases 中（超管以 super_admin 角色不匹配） | 既有 SLA worker/授权器语义，非本次引入；矩阵 aliases 后续可补充 `application_admin: ["application_admin", "super_admin"]` |
| R3 | low（披露，语义） | `analytics.export.failed` 在事务内失败时 `analytics_export_jobs` 行回滚，授权器拒绝通知 | 属"只通知真实导出任务"的既有语义；单测覆盖代码路径（t10 §5） |

## 四、验证复跑

- `corepack pnpm --filter @ai-hub/server test` → 476/476 全绿（含授权器修复后回归）
- `corepack pnpm verify` → EXIT=0（t8 全量证据，授权器修复后 server 子集复跑通过）

## 结论

Spec 与 Standards 双轴均通过。R1 修复后无阻塞级问题；R2/R3 为既有语义披露，不影响本次目标验收（A1–A5 达成）。**verdict: pass**。
