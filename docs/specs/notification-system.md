# 通知系统场景与接口说明

> 更新：2026-10-08。配套[当前需求基线](../requirements/README.md)的 REQ-NOT-01–03；本文件维护场景和接口细节，验收统一见[验收手册](../requirements/acceptance.md)。场景名称来自 DINGTALK_NOTIFICATION_MATRIX，接线、实际落库、外部送达分开取证。

## 1. 当前 21 场景

| #   | eventType                        | 目标收件人/变量               | 当前生产者                                      | 源码状态与限制                                                                    |
| --- | -------------------------------- | ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | application.review.requested     | 审核权限持有人广播            | application.service.ts submitForReview          | 完整草稿与旧版本入口均已 queue；广播和矩阵授权仍按旧角色，实际收信待验，GAP-02    |
| 2   | application.review.decided       | 应用负责人；decision          | application.service.ts review                   | 有 queue；application_owner 角色与资源负责人不等价；GAP-02                        |
| 3   | application.review.claim_expired | 审核权限持有人广播            | sla-reminder.worker.ts                          | 有直接站内通知；广播仍按旧角色编码找人                                            |
| 4   | application.review.sla.reminder  | 已认领审核人                  | sla-reminder.worker.ts                          | 有直接站内通知；需真库及 SLA 验收                                                 |
| 5   | application.review.sla.overdue   | application_admin/super_admin | sla-reminder.worker.ts                          | 实际 Worker 直接 createForEvent，收件人含 super_admin；与矩阵 alias 分开核验      |
| 6   | application.published            | 应用负责人                    | application.service.ts review 自动上架、publish | 有 queue；首次/恢复与更新入口分别验收，负责人 alias 差异                          |
| 7   | application.withdrawn            | 应用负责人                    | application.service.ts withdraw                 | 有 queue；负责人 alias 差异                                                       |
| 8   | application.withdraw.requested   | 应用负责人；reason            | application.service.ts requestWithdraw          | 有 queue；申请不等于下架，负责人 alias 差异                                       |
| 9   | demand.submitted                 | 需求审核/运营权限持有人广播   | demand.service.ts submitForReview               | 已循环广播；实际只查询 demand_operator，不自动包含 super_admin                    |
| 10  | demand.reviewed                  | 需求提交人；decision          | demand.service.ts review                        | 有 queue，null 收件人跳过；待真库触发验收                                         |
| 11  | demand.claimed                   | 需求提交人                    | demand.service.ts claim                         | 旧直接认领与新 confirmClaim 均已 queue；新入口 L1 通过，真实角色/落库待验，GAP-02 |
| 12  | demand.collaborator_assigned     | 新协作者                      | demand.service.ts addCollaborator               | 有 queue；协作关系仍受矩阵角色校验                                                |
| 13  | demand.progress_updated          | 需求提交人；status            | demand.service.ts addProgressUpdate             | 有 queue；待真库触发验收                                                          |
| 14  | demand.pilot_started             | 需求提交人                    | demand.service.ts createPilot                   | 有 queue；创建记录不等于需求自动进入 pilot                                        |
| 15  | demand.closed                    | 需求提交人                    | demand.service.ts advanceStatus                 | 仅 nextStatus=closed 有 queue                                                     |
| 16  | demand.merged                    | 源/目标需求提交人             | demand.service.ts merge                         | 分别 queue；授权和重复收件人幂等需真库核验                                        |
| 17  | artifact.verification.failed     | 制品上传者；errorCode         | worker.module.ts handler                        | 有直接 createForEvent；依赖上传记录                                               |
| 18  | analytics.export.completed       | 导出请求人；target            | export.service.ts run 成功分支                  | 有 queue；任务归属授权                                                            |
| 19  | analytics.export.failed          | 导出请求人                    | export.service.ts run 失败分支                  | 有 queue；任务事务回滚后可能授权失败，GAP-07                                      |
| 20  | analytics.assistant.failed       | 助手请求人                    | assistant.service.ts ask 降级                   | 有 queue；aggregateId=sessionId，真实 Dify 未接入                                 |
| 21  | interaction.report.resolved      | 举报人                        | interaction.service.ts resolveReport            | 有 queue；举报/收件人归属校验                                                     |

业务事务提交后尽力调用通知，失败不能撤销已提交动作；广播逐人处理，空列表跳过。矩阵 queue 的目标规则还受实际 authorizer 限制；employee/super_admin 的权限不自动补成旧角色编码。幂等键为 eventType:aggregateId:recipientEmployeeId，同一事件/资源/员工重复触发不新增记录；重复业务轮次需要单独核验此键是否符合通知需求。

通知写入与 notification.created Outbox 同事务；钉钉 Worker 负责重试/失败记录。当前 API 与 Worker 的真实钉钉发送均为 unavailable stub，不能将站内创建或 demo sent 状态写为钉钉送达。

详细源码、收件人别名及本次测试见[需求事实审计](../audit/requirements-evidence-2026-10-07.md)；旧 21/21 静态核对与重复报告已合并为[历史验证记录](../audit/notification-verification-2026-08-29.md)。

## 2. API 契约

### Console：/internal/notifications

| 方法 | 路径                                         | 成功响应                | 授权                                             |
| ---- | -------------------------------------------- | ----------------------- | ------------------------------------------------ |
| GET  | /internal/notifications                      | NotificationRecordDto[] | notification.read，当前收件人                    |
| GET  | /internal/notifications/:notificationId      | NotificationRecordDto   | notification.read，当前收件人                    |
| GET  | /internal/notifications/summary              | { unreadCount: number } | notification.read                                |
| POST | /internal/notifications/:notificationId/read | NotificationRecordDto   | notification.read，当前收件人                    |
| POST | /internal/notifications/read-all             | { updated: number }     | notification.read                                |
| POST | /internal/notifications/retry                | 重试结果                | notification.deliver；不能以读取权限重试外部投递 |

### Portal：/internal/portal/notifications

| 方法 | 路径                                                | 成功响应                | 授权                          |
| ---- | --------------------------------------------------- | ----------------------- | ----------------------------- |
| GET  | /internal/portal/notifications                      | NotificationRecordDto[] | notification.read             |
| GET  | /internal/portal/notifications/summary              | { unreadCount: number } | notification.read             |
| POST | /internal/portal/notifications/:notificationId/read | NotificationRecordDto   | notification.read，当前收件人 |
| POST | /internal/portal/notifications/read-all             | { updated: number }     | notification.read             |

全部接口要求认证。首选 HttpOnly Cookie，兼容身份请求头；写请求携带 CSRF token、x-request-nonce、x-request-timestamp。越权读取他人通知返回 404 NOTIFICATION_NOT_FOUND；未认证 401，缺权限 403。Portal 通知不参与公开缓存，响应 private/no-cache，完整接口与认证约定见[Portal 手册](../handoff/ai-hub-portal-api.md)。

通知记录字段为 notificationId、recipientEmployeeId、eventType、aggregateId、idempotencyKey、message、payload、readAt、createdAt；readAt=null 表示未读。payload 支持 title、body、detail、deepLink，前端缺省回退 message。具体 DTO、过滤参数和重试响应以当前 controller 为准。

## 3. 双端展示与验收

- summary 提供真实未读数，查询 30 秒轮询；点击即读/全部已读由服务端持久化，写后刷新列表和 summary。
- 展示 payload 和真实 eventType/aggregateId/createdAt，不硬编码演示版本、人名或审核意见。
- demo 类型使用 demo:notification: 幂等前缀，与真实事件隔离；system/互动展示类型不自动计入 21 个矩阵场景。
- AC-12 必须从真实业务动作取 notificationId、收件人、payload、Outbox、未读/已读及重复触发证据；新草稿提交/认领方案、旧版本提交/直接认领分别取证。
- AC-13 单独验证钉钉真实成功、重试和失败；AC-14 验证同域双端数据与缓存隔离。单测 queue 断言不能替代这些证据。
