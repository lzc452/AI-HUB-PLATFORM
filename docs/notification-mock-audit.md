# 系统通知 Mock 与合规自查报告

> 目标：向数据库 mock 覆盖**全部通知类型**的系统通知，按 5 个角色分别推送不同通知，
> 前端完整展示，并从 **数据库规范 / 后端 API / 前端展示** 三个维度完成自检。
> 生成日期：2026-08-11

## 一、关键发现（修复前的问题）

排查源码后发现通知链路存在**三套互相不一致的 taxonomy**：

| 来源 | 文件 | 内容 |
| --- | --- | --- |
| 后端权威场景矩阵 | `packages/server/src/notification/dingtalk-matrix.service.ts` | `DINGTALK_NOTIFICATION_MATRIX` 定义 **14 个**官方通知场景 |
| 旧 fixture 用的 eventType | `packages/database/.../notification.fixture.ts`（旧） | 一套**不同**的 15 个 eventType（如 `application.favorited`、`demand.status_changed`） |
| 前端匹配分支 | `apps/web/.../notificationMeta.ts`（旧） | 基于 `.includes()` 的 6 个分类分支 |

**直接后果**：旧 fixture 中部分 eventType 无法命中前端任何专属分支，会落到兜底分类
「系统通知」，导致前端展示不完整。经核算，**20 个全类型中有 8 个**原本会落入兜底。

## 二、改动清单

| 文件 | 改动 |
| --- | --- |
| `packages/database/src/demo-data/fixtures/notification.fixture.ts` | 重写为 **20 条**通知，覆盖 14 个官方场景 + 3 个系统通知 + 3 个互动/安全类，按 5 个角色分发 |
| `apps/web/src/pages/notifications/notificationMeta.ts` | 扩展「审核相关/评论互动/安全告警」分支，新增「数据洞察」分支，确保 20 个类型均落入专属分类 |
| `packages/database/src/demo-data/fixtures/notification.fixture.test.ts` | 重写为 20 条断言（类型唯一覆盖、角色分布、状态覆盖、幂等键、字段） |
| `packages/database/src/demo-data/orchestrator.ts` | `expectedCounts.notification` 由 15 改为 **20** |
| `apps/web/src/pages/notifications/notificationMeta.test.tsx`（新增） | 20 个权威类型 → 分类映射断言，且**不得**为兜底「系统通知」 |

## 三、类型覆盖矩阵（20 条 → 角色 → 前端分类 → 投递状态）

| # | eventType | 接收角色 | 前端分类 | 投递状态 |
| --- | --- | --- | --- | --- |
| 0 | application.review_decided | 普通员工 | 审核相关 | sent |
| 1 | demand.submitted | 普通员工 | 创新需求 | sent |
| 2 | demand.progress_updated | 普通员工 | 创新需求 | sent |
| 3 | application.comment_replied | 普通员工 | 评论互动 | sent |
| 4 | application.review_requested | 应用管理员 | 审核相关 | pending |
| 5 | system.announcement | 应用管理员 | 平台公告 | sent |
| 6 | application.reported | 应用管理员 | 安全告警 | failed |
| 7 | application.published | 创新运营 | 审核相关 | sent |
| 8 | demand.claimed | 创新运营 | 创新需求 | sent |
| 9 | demand.collaborator_assigned | 创新运营 | 创新需求 | pending |
| 10 | demand.pilot_started | 创新运营 | 创新需求 | sent |
| 11 | application.withdrawn | 组织管理员 | 审核相关 | retry |
| 12 | demand.closed | 组织管理员 | 创新需求 | sent |
| 13 | analytics.export.completed | 组织管理员 | 数据洞察 | sent |
| 14 | system.maintenance | 组织管理员 | 系统告警 | retry |
| 15 | demand.merged | 超级管理员 | 创新需求 | sent |
| 16 | analytics.export.failed | 超级管理员 | 数据洞察 | failed |
| 17 | analytics.assistant.failed | 超级管理员 | 数据洞察 | retry |
| 18 | system.audit_alert | 超级管理员 | 系统告警 | failed |
| 19 | application.rating_added | 超级管理员 | 评论互动 | sent |

- **角色分布**：普通员工 4 / 应用管理员 3 / 创新运营 4 / 组织管理员 4 / 超级管理员 5（各不相同）
- **投递状态**：pending 2、sent 12、retry 3、failed 3（四种全覆盖）
- **已读/未读**：已读 8、未读 12（混合）

## 四、维度一：数据库规范符合性 ✅

`notifications` 表（`packages/database/src/schema.ts`）列定义与 fixture 插入字段**逐列对齐**：

| 表列 | 类型 | fixture 是否提供 | 备注 |
| --- | --- | --- | --- |
| notification_id | Generated<uuid> | ✅ `IDS.notification[idx]` | 20 个均唯一且为合法 UUID |
| recipient_employee_id | string | ✅ 5 个 demo 员工之一 | 全部引用真实 demo 账号 |
| event_type | string | ✅ 20 个权威类型 | 非空 |
| aggregate_id | string | ✅ 合法 ID（app/demand/export/department） | 前端跳转链接可用 |
| idempotency_key | string | ✅ `demo:notification:...` | 唯一、demo 作用域 |
| message | string | ✅ 非空 | |
| read_at | Date \| null | ✅ 12 条为 null | 已读含合法 Date 且 ≥ created_at |
| delivery_status | enum | ✅ pending/sent/retry/failed | 四种全覆盖 |
| delivery_attempts | number | ✅ | pending/sent ≤1；retry/failed ≥2 |
| last_delivery_error | string \| null | ✅ | pending 为 null；retry/failed 非空 |
| next_attempt_at | Date \| null | ✅ | 仅 retry 非 null |
| created_at | Date | ✅ | 全部为 Date |

无外键约束（`notifications` 表无 FK 定义），聚合 ID 为自由字符串，无约束冲突风险。
`upsertNotification` 以 `notification_id` 为主键做 `ON CONFLICT DO UPDATE`，可重复 seed 幂等。

## 五、维度二：后端 API 规范符合性 ✅

- **接口**：`GET /internal/notifications`（`packages/server/src/notification/notification.controller.ts`），
  需 `NOTIFICATION_READ` 权限，返回 `NotificationRecordDto[]`。
- **DTO 字段**（`notification.dto.ts`）与**前端 client 类型**（`apps/web/.../notification.client.ts`）
  逐字段一致：`notificationId / recipientEmployeeId / eventType / aggregateId /
  idempotencyKey / message / readAt(string|null) / createdAt(string)`。
- **服务行为**（`notification.service.ts`）：`list` 仅返回当前调用者
  （`actor.employeeId`）的通知，权限经 `authorization.authorize` 校验；`idempotencyKey`
  格式为 `eventType:aggregateId:recipientEmployeeId`，与 fixture 的独立幂等键不冲突。
- 单条 `POST :notificationId/read`、批量全部已读均对齐前端 `useNotification` 的调用。

## 六、维度三：前端展示完整性 ✅

`resolveNotificationMeta` 现对每个 eventType 命中专属分支，**无一条落入兜底「系统通知」**：

| 前端分类 | 覆盖的 eventType | 分支来源 |
| --- | --- | --- |
| 审核相关 | review_requested / review_decided / review_approved / published / withdrawn | 扩展原分支 + 动态标题 |
| 评论互动 | comment_replied / rating_added | 扩展原分支（新增 `rating`，图标 `StarFilled`） |
| 安全告警 | scan / security / reported | 扩展原分支（新增 `report`） |
| 平台公告 | announcement / platform | 原分支 |
| 创新需求 | demand.* （7 个子类型动态标题） | 增强动词映射 |
| 系统告警 | system / storage / alert | 原分支 |
| 数据洞察 | analytics.export.* / analytics.assistant.failed | **新增分支**（图标 `BarChartOutlined`） |

列表页（标题 + 副标题 + 相对时间 + 未读圆点 + 分页 + 全部已读）与详情弹层
（图标 + 分类标签 + 导语 + 结构化字段 + 行动按钮）均能完整渲染全部 7 类通知。

## 七、验证结果

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 数据库 fixture 单测 | `vitest run .../notification.fixture.test.ts` | ✅ 26/26 |
| 前端元信息完整性单测 | `vitest run .../notificationMeta.test.tsx` | ✅ 21/21 |
| 前端通知页回归 | `vitest run .../NotificationsPage.test.tsx` | ✅ 7/7 |
| 数据库包类型检查 | `tsc --noEmit` | ✅ 无 notification 相关错误 |
| 前端包类型检查 | `tsc --noEmit` | ✅ 无 notification 相关错误 |

## 八、如何运行（写入数据库）

```bash
# 需要可用的 PostgreSQL 并设置环境变量
export DATABASE_URL="postgres://user:pass@localhost:5432/aihub"
export DEMO_DATA_ENABLED="true"
pnpm seed:demo-data          # 内部调用 seedDemoDataset({ mode: "reset" })
pnpm --filter @ai-hub/database exec tsx scripts/check-demo-data.mts  # 校验计数（notification=20）
```

## 九、已知限制 / 后续

- 后端 `DINGTALK_NOTIFICATION_MATRIX` 仅定义 14 个**场景**，未涵盖 `application.favorited`、
  互动类与 `system.*`；这些由业务事件直接 `createForEvent` 产生。本报告将二者合并视为
  "全部通知类型"。若需严格以矩阵为准，可后续在矩阵中补齐互动/系统类场景。
- 详情弹层的"审核意见/审核人员"等为演示文案，非来自数据库字段（现有 `notifications` 表仅存
  `message` 文本，无结构化详情字段）。如需完整结构化展示，建议扩展表结构或关联聚合实体。
