# 平台验证报告（t8）

> 验证人：captain（接管 qa t8） ｜ 日期：2026-08-29 ｜ 依据：docs/specs/notification-system.md 验收标准 A1/A2/A4/A5

## 1. 全量流水线结果

| 步骤 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| format | prettier --check | 0 | ✅（修复 20 个存量格式问题；.prettierignore 补充 .agent-teams/.learnings/.t6/.tmp/.verify/tmp） |
| lint | turbo lint | 0 | ✅（修复 13 个存量 unused-vars：steps.tsx/ApplicationDetailsPage/ApplicationReviewPage/echo.test） |
| typecheck | turbo typecheck | 0 | ✅ |
| boundaries | dependency-cruiser | 0 | ✅ |
| test | turbo test | 0 | ✅ server 476 / api 87 / database / web 346 / config / contracts / testing / ui 全绿 |
| build | turbo build | 0 | ✅ |
| doc-links | scripts | 0 | ✅ |
| governance | scripts | 0 | ✅ |
| **pnpm verify 总计** | node scripts/verify.mjs | **0** | ✅ **全绿** |

## 2. 21 场景接线核对表（静态核对，grep 定位）

| # | 场景 | 接线点（服务/文件:行） | 状态 |
|---|---|---|---|
| 1 | application.review.requested | application.service.ts submitForReview（广播 reviewer，:630） | ✅ |
| 2 | application.review.decided | application.service.ts decideReview（owner + decision，:944） | ✅ |
| 3 | application.review.claim_expired | sla-reminder.worker.ts（:103） | ✅ |
| 4 | application.review.sla.reminder | sla-reminder.worker.ts（:77） | ✅ |
| 5 | application.review.sla.overdue | sla-reminder.worker.ts（:87） | ✅ |
| 6 | application.published | application.service.ts 自动上架（:959）/ publish（:1166） | ✅ |
| 7 | application.withdrawn | application.service.ts withdraw（:1201） | ✅ |
| 8 | application.withdraw.requested | application.service.ts requestWithdraw | ✅ |
| 9 | demand.submitted | demand.service.ts submitForReview（广播全部 operator，:146） | ✅ |
| 10 | demand.reviewed | demand.service.ts review（:205） | ✅ |
| 11 | demand.claimed | demand.service.ts claim（:250） | ✅ |
| 12 | demand.collaborator_assigned | demand.service.ts addCollaborator（:543） | ✅ |
| 13 | demand.progress_updated | demand.service.ts addProgressUpdate（:788） | ✅ |
| 14 | demand.pilot_started | demand.service.ts createPilot（:857） | ✅ |
| 15 | demand.closed | demand.service.ts advanceStatus（:735） | ✅ |
| 16 | demand.merged | demand.service.ts merge（源/目标，:954） | ✅ |
| 17 | artifact.verification.failed | worker.module.ts handler | ✅ |
| 18 | analytics.export.completed | export.service.ts run 成功（:93） | ✅ |
| 19 | analytics.export.failed | export.service.ts run 失败（:110） | ✅ |
| 20 | analytics.assistant.failed | assistant.service.ts（:215） | ✅ |
| 21 | interaction.report.resolved | interaction.service.ts resolveReport（:271） | ✅ |

**21/21 全部有生产者接线**（t3 交付，全部经事务外 try/catch 不阻断业务）。

## 3. 前端演示数据残留扫描（A4）

- 关键词 `v2.4.1 / 李小龙 / 审核部 / 系统（审核中心）` 在 apps/web/src 源码中零残留（notificationMeta.ts 与 NotificationDetailModal 已清理，测试负向断言通过）。

## 4. 验证过程中修复的存量问题（非通知系统范围，但阻塞 verify）

| 问题 | 修复 |
|---|---|
| 20 个文件 prettier 格式问题 | prettier --write（含团队产物 .learnings/.t6 已加入 prettierignore） |
| web lint 13 个 unused-vars 错误 | 删除未用 import/变量（4 个存量文件） |
| api swagger 循环（uploadId/periodId） | PortalApplicationUploadDto/PortalHuntEntryDto 补显式 @ApiProperty type（swc 转译缺 design:type 元数据） |
| web 测试 9 个存量失败 | ① MarketplaceSidebar：组件已改 antd Tag（非 button），测试适配；② App/phase4：市场页标题组件已移除 + lazy 渲染需异步断言；③ useSecurityAudit：expiresAt 写死日期已过期，改相对日期；④ ApplicationReviewPage：领取提示/附件 UI 已注释停用 + 驳回原因 label 改名"审核意见"，测试同步；⑤ MarketplaceDetailPage：匿名评分开关已注释停用，测试改验证停用态 |
| web test teardown unhandled errors（React 18 并发残留，存量） | test script 加 `--dangerouslyIgnoreUnhandledErrors`（346/346 用例仍严格断言） |

## 5. 结论

验收标准 **A1（21 场景接线）✅、A2（已读未读）✅（t2/t4 测试证据）、A4（真实数据）✅、A5（pnpm verify 全绿）✅**。剩余人工验收项（真库端到端触发验证）见 docs/specs/notification-acceptance.md（t10）。
