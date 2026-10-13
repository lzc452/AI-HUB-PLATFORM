# 通知系统历史验证与审查合并记录

> 原批次：2026-08-11、2026-08-28、2026-08-29；合并日期：2026-10-07。本文件保留历史测试、种子及审查证据，不作为当前已全部验收的结论。当前规则见[需求基线](../requirements/README.md)，当前执行见[验收手册](../requirements/acceptance.md)。

合并来源为原 `docs/notification-mock-audit.md`、`docs/specs/notification-verification-platform.md`、`notification-verification-portal.md`、`notification-acceptance.md`、`notification-review.md`。重复规格与人工步骤归入[通知契约](../specs/notification-system.md)和统一验收手册，五份重复报告移除。

## 1. 原批次实际证明的范围

| 原验收标准           | 原记录                                              | 证据范围与限制                                                                         |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A1 21 场景真实通知   | 当时声称通过，21/21 接线核对及 queue 参数测试       | 静态生产者与替身端口断言；原验收 §4 明确真库业务触发未执行，不能证明 21 场景落库       |
| A2 Console 已读/未读 | 当时通过                                            | summary/read-all、点击已读、30 秒轮询及组件测试；未证明本次部署                        |
| A3 Portal 通知       | 当时通过，4/4 契约一致                              | 跨仓单测/契约和受环境限制的构建，真实同域联调仍需另验                                  |
| A4 展示真实字段      | 当时通过                                            | 演示人名、版本号、固定审核意见负向扫描；payload 驱动详情                               |
| A5 工程流水线        | Platform verify 当时退出 0；Portal 四项检查记录通过 | 前端使用过忽略未处理异常参数；Portal 构建落盘有模拟复制，不能等同严格正常环境/当前全绿 |

原报告的“全部达成/PASS”按上述层级解释，不扩大到真库端到端、两种当前分发角色、真实钉钉送达或生产验收。[本次事实核对](requirements-evidence-2026-10-07.md)另发现广播、矩阵授权、新认领方案和失败导出通知差异。

## 2. Platform 历史流水线及改动

2026-08-29 记录 `corepack pnpm verify` 退出 0，包含 format、lint、typecheck、boundaries、test、build、doc-links、governance。测试自述为 server 476、API 87、Web 346，以及 database/config/contracts/testing/ui 包通过；通知域 24、通知页面 8、Swagger 2 个用例通过。这些数量保留原批次含义，本轮未复跑全量流水线。

21 场景当时均找到生产者；应用/需求广播、裁决、发布/下架、协作/进度/试点/关闭/合并、制品失败、导出完成/失败、助手失败、举报处理均在报告中核对。当前具体入口和限制以通知契约及事实审计为准，原行号不继续作为维护依据。

| 原批次存量修复           | 原处置                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| 20 个文件格式问题        | Prettier 修复，补充临时目录忽略规则                                                 |
| Web 13 个 unused-vars    | 清理步骤、详情/审核及回显测试未用变量                                               |
| Swagger 循环元数据       | PortalApplicationUploadDto/PortalHuntEntryDto 显式声明属性 type                     |
| Web 9 个存量失败         | 适配 antd Tag、异步页面、相对会话日期、审核意见和停用的匿名评分 UI                  |
| 测试 teardown 未处理异常 | Web test script 增加 `--dangerouslyIgnoreUnhandledErrors`；这不构成严格异常检查通过 |

前端关键词 `v2.4.1`、`李小龙`、`审核部`、`系统（审核中心）` 当时在通知展示源码中无残留，保留对应负向断言。页面字段优先 `payload.title/body/detail/deepLink`，缺省回退 `message`。

## 3. Portal 历史验证条件

目标仓库为 `D:\workspace\AI-HUB-PORTAL`；原版本接口文档为 v1.4。

| 检查                | 原结果                                          | 环境条件                                                                            |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run typecheck` | 退出 0，无诊断                                  | 正常 tsc                                                                            |
| `npm run lint`      | 退出 0，0 errors、5 warnings                    | shadcn/ui 的 react-refresh warning；样式架构检查通过                                |
| Vitest              | 2 文件、50/50：通知 9，Portal 基础 41；16.39 秒 | DSH 沙箱 spawn EPERM，使用 TypeScript 进程内 esbuild 垫片、runner loader 与 threads |
| Vite build          | 3471 modules、36.51 秒，含通知页面 chunk        | 同一沙箱垫片                                                                        |
| prepare-sites-build | 输入齐全，复制逻辑模拟通过                      | 外仓最终复制 EPERM；未实际完成完整生产落盘                                          |

构建输入记录为 `worker/index.js` 483 B、`.openai/hosting.json` 31 B、`dist/client/index.html` 735 B；工作区内两份等价复制成功不代替目标仓库产物。临时 `.t6` 垫片已在整理中清理，不恢复为标准验证设施。

原静态契约对照：`GET /internal/portal/notifications`、`GET /summary`、`POST /:notificationId/read`、`POST /read-all` 路径/方法 4/4 一致；通知 DTO、summary `{ unreadCount }`、批量 `{ updated }` 一致。使用 Cookie 同源凭据、`notification.read`、CSRF/nonce/timestamp，通知响应 private/no-cache；列表和 summary 30 秒轮询，写后刷新两查询。上述是历史契约核对，客户端当前 UI 本轮未重新验证。

原 `VITE_PORTAL_USE_FIXTURES=true` 通知只有 2 条本地数据；默认真实 API 模式与 fixture 模式必须分别标注，fixture 不能取代真实触发。

## 4. 种子与 taxonomy 历史记录

旧 fixture 有 15 个 eventType，与 21 场景矩阵及前端分类不一致；20 个展示类型中曾有 8 个落入兜底。2026-08-28 对齐为 20 条：14 个矩阵场景、3 个 system 场景、3 个互动/安全展示场景。非矩阵 demo 类型不计入 21 场景真实验收。

| #   | 原 eventType                 | 历史收件分组 | 投递状态 |
| --- | ---------------------------- | ------------ | -------- |
| 0   | application.review.decided   | 普通员工     | sent     |
| 1   | demand.submitted             | 普通员工     | sent     |
| 2   | demand.progress_updated      | 普通员工     | sent     |
| 3   | application.comment_replied  | 普通员工     | sent     |
| 4   | application.review.requested | 应用管理员   | pending  |
| 5   | system.announcement          | 应用管理员   | sent     |
| 6   | application.reported         | 应用管理员   | failed   |
| 7   | application.published        | 创新运营     | sent     |
| 8   | demand.claimed               | 创新运营     | sent     |
| 9   | demand.collaborator_assigned | 创新运营     | pending  |
| 10  | demand.pilot_started         | 创新运营     | sent     |
| 11  | application.withdrawn        | 组织管理员   | retry    |
| 12  | demand.closed                | 组织管理员   | sent     |
| 13  | analytics.export.completed   | 组织管理员   | sent     |
| 14  | system.maintenance           | 组织管理员   | retry    |
| 15  | demand.merged                | 超级管理员   | sent     |
| 16  | analytics.export.failed      | 超级管理员   | failed   |
| 17  | analytics.assistant.failed   | 超级管理员   | retry    |
| 18  | system.audit_alert           | 超级管理员   | failed   |
| 19  | application.rating_added     | 超级管理员   | sent     |

分组数量为 4/3/4/4/5，状态 pending/sent/retry/failed 为 2/12/3/3，已读/未读为 8/12。五分组为旧 fixture 数据，不是当前只分发 employee/super_admin 的角色方案；填入 sent 不能证明外部真实送达。

未纳入种子的矩阵场景为 `application.review.claim_expired`、`application.review.sla.reminder`、`application.review.sla.overdue`、`application.withdraw.requested`、`demand.reviewed`、`artifact.verification.failed`、`interaction.report.resolved`。

历史字段自查包括 UUID 唯一、真实 demo 收件人引用、合法 aggregateId、`demo:notification:` 幂等前缀、非空 message、结构化 payload、readAt 时间、四类投递状态/尝试/错误/重试时间。前端分为审核、互动、安全、公告、需求、系统、数据洞察七类；演示状态不是业务链取证。

2026-08-28 自述 fixture 26/26、元信息 21/21、页面 7/7，以及 database/web typecheck 无 notification 相关错误；2026-08-29 页面增加到 8 个，不能把不同批次数量混为一组。当前演示初始化和检查命令见[项目 README](../../README.md)，仅用于隔离开发环境；本次没有执行 seed。

## 5. 历史审查问题与当前边界

| 问题                                                    | 原处置                                    | 当前解释                                                                                          |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R1 协作者只匹配 collaborator，漏 operator               | 原批次移除 role 过滤，报告 server 476/476 | 协作关系检查修复不等于矩阵收件人角色规则已适配当前 employee                                       |
| R2 overdue 的 application_admin alias 不含 super_admin  | 原批次披露待补                            | 实际 SLA Worker 直接 createForEvent 且收件人含 super_admin；不能据矩阵 alias 断言 Worker 一定失败 |
| R3 analytics.export.failed 授权要求任务行，事务回滚无行 | 原批次披露为既有语义                      | 真实失败通知未完整持久化，应列 GAP-07，不能算成功落库                                             |

原人工步骤是应用提交/审核/发布、需求提交/认领/协作/关闭/合并、已读持久化、同域 Portal 通知、seed 幂等；当时全部未完成真库触发。当前改用[AC-12 通知案例](../requirements/acceptance.md)，同时覆盖新 submitDraft/confirmClaim 与旧入口。

未完成的证据包括真实钉钉投递、真库 21 场景、新分发角色收信、Portal 同域最终构建与浏览器联调、失败任务通知和生产运行。本次源码差异见[需求事实审计](requirements-evidence-2026-10-07.md)，不会由历史审查 PASS 自动关闭。
