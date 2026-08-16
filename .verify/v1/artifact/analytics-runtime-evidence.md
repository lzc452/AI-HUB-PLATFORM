# Analytics 完整 read model 运行时证据

执行时间：2026-08-16（Asia/Shanghai）

## 补齐内容

- contracts：新增 `application_liked/commented/rated`、`feedback_submitted/resolved`
  五个行为事件与 `feedback` 聚合类型。
- 指标字典：新增 11 个指标（平台月活/活跃应用/交付动作三个事件型，
  上架/待审核/待认领三个快照型，应用点赞/评论/评分，反馈提交/处理），
  并支持 `count / distinct_actor / distinct_aggregate / snapshot` 四种聚合口径。
- 看板映射：platform=7、application=4、risk=3 等。
- 事件写入：InteractionService（点赞/评分/评论/官方回复）与 FeedbackService
  （提交/终态处理）在真实事务路径记录行为事件；两个 module 注入 AnalyticsEventService。
- migration `0032_analytics_interaction_feedback_events`：放宽
  `analytics_behavior_events_name_check` 至 20 个事件名，并 upsert 11 个新指标定义；
  down 可回收。
- demo seed：20 事件类型 × 2 = 40 事件，30 天 × 20 指标 × 3 scope = 1800 聚合
  （`analytics=1840`）；`check:demo-data` analytics 期望 40。

## 运行时验证（注入库 ai_hub_inject）

- 平台看板 7 天：`application_views=1463`、`active_employee_count=521`、
  `active_application_count=541`、`delivery_action_count=802`，
  快照 `published=310`、`pending_review=2`、`pending_claim=2`；
  30 天与 90 天（seed 仅 30 天）数值一致且随窗口单调。
- 应用看板：downloads/likes/comments/ratings 四项均有聚合值。
- 风险看板：reported_interactions/feedback_submissions/feedback_resolutions 三项均有值。
- 权限：`DEMO-EMPLOYEE`（无任何 analytics 权限）读平台看板 → `403 NOT_AUTHORIZED`。
- CSV 导出：`POST /internal/analytics/exports {target: platform, 7d}` → `201`，
  rows=21（7 天 × 3 scope，与 `platform.application_views` 日聚合行数一致）。
- 事件闭环：真实 API 点赞(201)/评分(201)/评论(201)/反馈(201)/所有者处理(200) 后，
  五类新事件各新增 1 条真实行（`analytics_behavior_events` 按 event_name 计数闭环）。

## 发现并说明

- 反馈处理控制器要求 `INTERACTION_MODERATE`，普通应用所有者
  （application_admin）不具备该权限，会被 403 拦截在服务层所有者校验之前；
  本批使用超级管理员所有的应用完成闭环验证。该权限矩阵缺口与五角色矩阵批次
  （计划第 6 项）一并修复：所有者处理反馈应走 owner/maintainer 语义，
  moderation 仅用于官方回复/隐藏/恢复等治理动作。
- 平台快照指标为“当前时刻”计数，历史按日回放依赖状态历史表，V1 暂以
  read-model snapshot 口径固化。
