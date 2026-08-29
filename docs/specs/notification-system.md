# 通知系统实施规格

> 本文档是 AI-HUB-PLATFORM 完整消息通知系统实施与验收的权威规格，供各实现/验证/审查任务共同引用。
> 生成日期：2026-08-28 ｜ 关联团队：notification-complete ｜ 权威通知场景来源：`DINGTALK_NOTIFICATION_MATRIX`（packages/server/src/notification/dingtalk-matrix.service.ts）

## 1. 通知场景接线矩阵（21 场景）

| # | eventType（权威命名） | 收件人规则（recipientRole） | 接线点（服务/方法） | 模板变量 | 状态 |
|---|---|---|---|---|---|
| 1 | application.review.requested | 广播全部 application_reviewer | application.service.ts `submitForReview` | — | 待接线 |
| 2 | application.review.decided | application_owner（应用 owner） | application.service.ts `decideReview` | decision | 待接线 |
| 3 | application.review.claim_expired | 广播全部 application_reviewer | sla-reminder.worker.ts `createSlaReminderRunner` | — | 已接线 |
| 4 | application.review.sla.reminder | 已领取的审核人 | sla-reminder.worker.ts `createSlaReminderRunner` | — | 已接线 |
| 5 | application.review.sla.overdue | 广播全部 application_admin + super_admin | sla-reminder.worker.ts `createSlaReminderRunner` | — | 已接线 |
| 6 | application.published | application_owner | application.service.ts `publish()` 与 `decideReview` 自动上架分支 | — | 待接线 |
| 7 | application.withdrawn | application_owner | application.service.ts `withdraw()` | — | 待接线 |
| 8 | application.withdraw.requested | application_owner | application.service.ts `requestWithdraw` | reason | 已接线 |
| 9 | demand.submitted | 广播全部 demand_operator（修复现状仅 reviewers[0]） | demand.service.ts `submitForReview` | — | 已接线（需广播修复） |
| 10 | demand.reviewed | demand_submitter（requester） | demand.service.ts `review` | decision | 已接线 |
| 11 | demand.claimed | demand_submitter（requester） | demand.service.ts `claim` | — | 待接线 |
| 12 | demand.collaborator_assigned | 新协作者本人 | demand.service.ts `addCollaborator` | — | 待接线 |
| 13 | demand.progress_updated | demand_submitter（requester） | demand.service.ts `addProgressUpdate` | status | 待接线 |
| 14 | demand.pilot_started | demand_submitter（requester） | demand.service.ts `createPilot` | — | 待接线 |
| 15 | demand.closed | demand_submitter（requester） | demand.service.ts `advanceStatus`（nextStatus=closed） | — | 待接线 |
| 16 | demand.merged | 源/目标需求 requester（分别 queue） | demand.service.ts `merge` | — | 待接线 |
| 17 | artifact.verification.failed | artifact_uploader（上传者） | worker.module.ts `createArtifactVerificationFailedNotificationHandler` | errorCode | 已接线 |
| 18 | analytics.export.completed | export_requester（=actor.employeeId） | export.service.ts `run` 成功路径 | target | 待接线 |
| 19 | analytics.export.failed | export_requester（=actor.employeeId） | export.service.ts `run` 失败路径 | — | 待接线 |
| 20 | analytics.assistant.failed | assistant_requester（=actor.employeeId，aggregateId=actor.sessionId） | assistant.service.ts `ask` 外部不可用路径 | — | 待接线 |
| 21 | interaction.report.resolved | report_author（举报人） | interaction.service.ts `resolveReport` | — | 已接线 |

**接线统一约定**：
- 通知调用在业务事务提交后执行，`try/catch` 吞异常，失败不回滚业务（ADR 0005 §6；与 demand.review 现有模式一致）。
- 广播列表为空时静默跳过；requesterEmployeeId 为 null（匿名）时跳过。
- 幂等键 `eventType:aggregateId:recipientEmployeeId`，重复触发不产生重复通知。
- 收件人授权由 `DingTalkNotificationMatrixService.queue` 内的 authorizer 校验（角色 + 资源归属），失败抛 `NOTIFICATION_RECIPIENT_NOT_AUTHORIZED` 由调用方吞掉。
- 非矩阵场景（system.*、互动类 application.comment_replied 等）仅存在于 demo 种子，标注为"系统通知"，不参与矩阵验收。

## 2. API 契约

### 2.1 Web / 管理端（/internal/notifications，兼容 header 认证 + cookie）

| 方法 | 路径 | 请求 | 成功响应 | 权限 |
|---|---|---|---|---|
| GET | /internal/notifications/summary | — | 200 `{ "unreadCount": number }` | notification.read |
| POST | /internal/notifications/read-all | — | 200 `{ "updated": number }` | notification.read |

- 现有 `GET /internal/notifications`（列表）、`GET /:notificationId`、`POST /:notificationId/read`、`POST /retry` 保持向后兼容，DTO 不变。
- 错误码：401 `IDENTITY_CREDENTIALS_REQUIRED`、403 `NOT_AUTHORIZED`、404 `NOTIFICATION_NOT_FOUND`（越权读他人通知视为 404）。

### 2.2 Portal（/internal/portal/notifications，cookie 认证）

| 方法 | 路径 | 请求 | 成功响应 | 权限 |
|---|---|---|---|---|
| GET | /internal/portal/notifications | — | 200 `NotificationRecordDto[]` | notification.read |
| GET | /internal/portal/notifications/summary | — | 200 `{ "unreadCount": number }` | notification.read |
| POST | /internal/portal/notifications/:notificationId/read | — | 200 `NotificationRecordDto` | notification.read |
| POST | /internal/portal/notifications/read-all | — | 200 `{ "updated": number }` | notification.read |

- 全部 `@Authenticated()`（未登录 401）+ `@CurrentActor()` + `@RequiresPermissions(NOTIFICATION_READ)`（无权限 403）；写操作沿用 CSRF/x-request-nonce/x-request-timestamp 约定。
- 响应 `private, no-cache`，不套用 PortalCacheControlInterceptor。
- 同步更新 `docs/handoff/ai-hub-portal-api.md` 至 v1.4。

### 2.3 通知记录 DTO（沿用 NotificationRecordDto）

`notificationId / recipientEmployeeId / eventType / aggregateId / idempotencyKey / message / payload / readAt(null=未读) / createdAt`。`payload` 结构：`{ title?, body?, detail?, deepLink? }`，前端详情优先渲染 payload，缺省回退 message。

## 3. 前端真实数据渲染要求

- 禁止硬编码演示字段：版本号（如 v2.4.1）、人名（如 李小龙/王芳）、固定审核意见、"系统（审核中心）"等一律移除。
- `notificationMeta.ts` 保留分类/图标/路由映射；详情字段改为 `payload.detail` + 真实字段（eventType/aggregateId/createdAt）驱动。
- Web 与 Portal 未读数均来自 `summary` 端点，轮询间隔 30s（React Query refetchInterval）。
- demo 种子 fixture 的 eventType 必须与矩阵命名一致（taxonomy 单一来源），幂等键保持 `demo:notification:` 前缀与真实事件隔离。

## 4. 验收标准（逐条可验证）

| # | 验收标准 | 验证方式 |
|---|---|---|
| A1 | 矩阵 21 场景的业务动作执行后产生真实站内通知（notifications 表），幂等不重复 | 单测断言 queue 调用参数 + 21 场景接线核对表（grep 各场景 queue/createForEvent 调用点） |
| A2 | Web 已读未读完整：头部徽标未读数（summary）、通知页全部/未读 Tabs、点击条目即读、全部已读走服务端批量、30s 轮询 | Web 单测 + pnpm verify |
| A3 | Portal 登录后通知正常：铃铛未读徽标、最近未读下拉、通知页（列表/筛选/分页/点击已读/全部已读/空态） | Portal npm run typecheck/lint/test/build + 契约核对 |
| A4 | 前端无硬编码演示数据残留（v2.4.1/李小龙/审核部/系统（审核中心）等关键词扫描为零） | grep 扫描 + 审查 |
| A5 | 全量流水线绿：AI-HUB-PLATFORM `pnpm verify`（format/lint/typecheck/boundaries/test/build/doc-links/governance）；AI-HUB-PORTAL `npm run typecheck/lint/test/build` | qa 验证报告（命令+退出码+关键输出） |

## 5. 关联产出物

- 平台验证报告：`docs/specs/notification-verification-platform.md`（qa）
- Portal 验证报告：`docs/specs/notification-verification-portal.md`（qa）
- 验收文档：`docs/specs/notification-acceptance.md`（qa）
- 审查报告：`docs/specs/notification-review.md`（reviewer）
