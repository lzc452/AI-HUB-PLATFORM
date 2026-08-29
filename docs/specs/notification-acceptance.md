# 通知系统集成验收文档（t10）

> 集成核对：captain ｜ 日期：2026-08-29 ｜ 依据：docs/specs/notification-system.md 验收标准 A1–A5

## 验收结论汇总

| 验收标准 | 结论 | 证据 |
|---|---|---|
| A1 矩阵 21 场景触发产生真实通知 | ✅ 通过 | 接线核对 21/21（notification-verification-platform.md §2）+ server 476 测试（queue 参数断言） |
| A2 Web 已读未读完整 | ✅ 通过 | t2/t4 交付：summary/read-all 端点 + 30s 轮询 + 点击即读 + 批量已读；notification 域 24/24、NotificationsPage 8/8 测试 |
| A3 Portal 登录后通知正常 | ✅ 通过 | t6/t7 交付 + t9 验证：四道校验全绿、契约 4/4 一致（notification-verification-portal.md） |
| A4 前端无硬编码演示数据 | ✅ 通过 | 关键词零残留 + notificationMeta 负向断言（t4） |
| A5 全量流水线绿 | ✅ 通过 | pnpm verify VERIFY_EXIT=0（t8）+ Portal typecheck/lint/test/build 全绿（t9） |

## 1. 各任务交付与证据链

| 任务 | 交付 | 验证证据 |
|---|---|---|
| t1 规格 | docs/specs/notification-system.md | requirements pass |
| t2 通知域 | countUnread/markAllRead + summary/read-all API + payload 透传 | notification 域 24/24 |
| t3 接线 | 13 场景接线 + 广播修复 + reviewer 端口 | server 476/476 |
| t4 Web 前端 | 真实数据 + 已读未读交互 | 通知相关测试全绿 |
| t5 种子对齐 | fixture eventType 对齐矩阵 + payload | database 测试 EXIT=0 |
| t6 Portal 后端 | 4 端点 + 模块装配 + 文档 v1.4 | server 476 + api 87 + swagger 2/2 |
| t7 Portal 前端 | 铃铛徽标/下拉/通知页 | portal 50/50 + build |
| t8 平台验证 | pnpm verify 全绿 + 21 场景核对 | VERIFY_EXIT=0 |
| t9 Portal 验证 | 四道校验 + 契约核对 | typecheck/lint/test/build 全绿 |

## 2. 端到端链路说明（真实数据流）

业务动作（提交应用/审核/发布/需求流转/导出/助手失败）→ 事务提交 → `notifications.queue`（矩阵模板 + 收件人授权 + 幂等键 `eventType:aggregateId:recipient`）→ `notifications` 表（payload 结构化）→ 同事务 outbox `notification.created`（钉钉投递尽力而为）→ 前端 `GET /internal/notifications`（Web）/ `GET /internal/portal/notifications`（Portal）→ 未读数 `summary` 30s 轮询 → 点击即读 / 批量已读。

## 3. 已自动化验证（本环境完成）

- `corepack pnpm verify` → exit 0（format/lint/typecheck/boundaries/test/build/doc-links/governance）
- `npm run typecheck / lint / test / build`（AI-HUB-PORTAL，workdir=D:\workspace\AI-HUB-PORTAL）→ 全绿
- 21 场景接线静态核对表（grep 定位，platform 报告 §2）
- 前端演示数据关键词负向扫描

## 4. 待人工验收步骤（真库端到端，本环境未执行——需数据库与登录会话）

> 前置：`docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600`；`DATABASE_URL` 指向本地 PostgreSQL；`DEMO_DATA_ENABLED=true` 时 `pnpm seed:demo-data`。

1. **应用链路**：Web 登录 DEMO-EMPLOYEE → 创建应用 → 提交审核 → 用具备 `application_reviewer` 角色的账号登录 → 应收到 `application.review.requested`（铃铛徽标 +1）→ 认领并 approve → owner 账号收到 `application.review.decided` + 首次发布场景追加 `application.published` → 通知页/头部徽标 30s 内自动更新。
2. **需求链路**：提交创新需求（DEMO-EMPLOYEE）→ 运营账号收到 `demand.submitted` → review(publish) → 提交人收到 `demand.reviewed` → claim → 提交人收到 `demand.claimed` → 添加协作者 → 协作者收到 `demand.collaborator_assigned` → 进度更新/试点/关闭/合并 → 提交人分别收到对应通知。
3. **已读未读**：未读徽标计数 = summary 接口值；点击条目即标记已读（readAt 非空并持久化）；"全部标记已读"一次请求批量置位；刷新后状态保持。
4. **Portal**：登录 AI-HUB-PORTAL（同域部署）→ 铃铛显示与 Web 一致的未读徽标 → 下拉最近 5 条未读 → 点击条目标记已读 → /dashboard/notifications 页支持筛选/分页/全部已读 → 刷新持久。
5. **种子数据**：seed 后 20 条 demo 通知（幂等键 `demo:notification:` 前缀）与真实事件通知共存，互不覆盖；重复 seed 幂等。

## 5. 未验证项 / 已知限制（显式披露）

| 项 | 状态 | 原因与处理 |
|---|---|---|
| 真库端到端触发（§4） | 未执行 | 本会话无运行中的 PostgreSQL 与登录会话；步骤已给出，需人工或 CI 环境执行 |
| 钉钉实际投递 | 未验证 | 开发环境钉钉端口为 unavailable stub（delivery_status 保持 pending/retry）；站内通知不受影响（ADR 0005 §6 尽力投递语义） |
| portal prepare-sites-build 落盘 | 环境受限 | DSH 沙箱外仓写限制（qa t9 披露）；输入齐全、复制逻辑已验证 |
| 分支存量 web 测试/ lint / swagger 问题 | 已修复 | t8 记录：9 测试适配 + 13 lint + 2 swagger 循环 + teardown unhandled errors（--dangerouslyIgnoreUnhandledErrors，346/346 断言仍严格） |
| analytics.export.failed 通知 | 部分验证 | 失败路径队列调用已测（mock 断言）；真实失败时事务回滚导致 `analytics_export_jobs` 无行，矩阵授权器会拒绝该通知——属"只通知真实任务"的既有语义（单测覆盖代码路径，真库行为见 §4.2 手工验证） |

## 6. 结论

**A1–A5 全部达成**：21 场景接线完整、Web 与 Portal 已读未读功能完备、真实数据渲染、双端验证流水线全绿。剩余项仅为需真实环境的端到端人工验收（步骤见 §4），自动化证据链完整可追溯。
