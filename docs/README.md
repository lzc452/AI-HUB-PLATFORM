# AI Hub Platform 文档索引

当前需求从以下三份文档进入；开发、接口与运维手册保留各自操作细节。带日期的设计、路线图、审计和验收只代表原批次，不再并列作为当前需求。

## 当前需求与验收

当前业务修复按[实施门禁与执行证据](requirements/gates.md)的五步顺序推进；已通过的单项与未执行阶段分别记录。

| 用途                                             | 文档                                                      |
| ------------------------------------------------ | --------------------------------------------------------- |
| 产品范围、角色、完整业务链与变更口径             | [当前需求基线](requirements/README.md)                    |
| 41 项需求 → 实现/接口/数据 → 现有测试 → 验收案例 | [需求追踪矩阵](requirements/traceability.md)              |
| 17 组验收案例、证据层级、执行命令与发布门禁      | [统一验收手册](requirements/acceptance.md)                |
| 身份/通知/外部集成/安全源码与本次测试事实        | [需求证据核对](audit/requirements-evidence-2026-10-07.md) |
| 菜单、路由与主要 API 授权速查                    | [访问控制矩阵](access-control-matrix.md)                  |
| 通知场景与双端接口细节                           | [通知系统说明](specs/notification-system.md)              |

## 开发、接口与运维手册

| 用途                          | 文档                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地启动、热更新和常用命令    | [开发指南](development/README.md)、[项目 README](../README.md)                                                                                |
| Windows 容器/代理与多设备     | [Windows Docker Compose](development/windows-docker-compose.md)、[跨设备开发](development/cross-device-development.md)                        |
| 分支、PR、发布和历史迁移      | [Git 与交付指南](development/git-branching.md)                                                                                                |
| Web 前端维护及接线            | [前端维护指南](handoff/frontend-handoff.md)                                                                                                   |
| Portal 接口与共享应用生命周期 | [Portal 接口手册](handoff/ai-hub-portal-api.md)                                                                                               |
| Portal/Console 同域路径       | [路由与部署约定](deployment/portal-console-routing.md)                                                                                        |
| 部署与回滚                    | [生产部署](runbooks/production-deploy.md)、[发布回滚](runbooks/release-rollback.md)                                                           |
| 安全、观测与响应              | [安全边界](runbooks/security-boundaries.md)、[可观测性](runbooks/observability.md)、[事件响应](runbooks/incident-response.md)                 |
| 故障恢复                      | [切换演练](runbooks/failover-drill.md)、[PostgreSQL 恢复](runbooks/postgres-failover.md)、[对象存储切换](runbooks/object-storage-failover.md) |
| 两端应用数据对账              | [Portal 应用对账](runbooks/portal-app-reconciliation.md)                                                                                      |

## 历史设计、决策与证据

| 材料                                                                                                          | 使用范围                                                               |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [历史设计/阶段计划索引](superpowers/README.md)                                                                | 原始设计、后续变更、阶段步骤与台账；不沿用旧排期/角色/状态作为当前标准 |
| [ADR](adr/)                                                                                                   | 决策依据；0004/0006/0007 标明后续覆盖及实现差异                        |
| [架构演进提案](architecture-redesign.md)、[流程图](flowchart/README.md)                                       | 原设计和 V2/V3 候选；当前业务流程以需求基线为准                        |
| [历史 UI 设计](ui-design/frontend-ui-design.md)、[原始设计图](../packages/ui/src/)                            | 视觉参照，不替代当前角色、入口和业务状态                               |
| [V1 本地台账](audit/v1-local-runnable-audit.md)                                                               | 2026-08-12 至 2026-08-16 的整改与运行证据                              |
| [历史双流程矩阵](audit/v1-flow-gap-matrix.md)、[收尾路径](audit/v1-remediation-roadmap.md)                    | 2026-08-12 缺口来源，当前差异见 GAP-01–10                              |
| [代码健康审查](audit/codebase-health-2026-08-14.md)、[PRD 差距分析](audit/prd2app-gap-analysis-2026-08-18.md) | 原批次快照，不推导当前全部 DONE/UNDO                                   |
| [安全修复合并记录](audit/security-remediation-2026-08-18.md)                                                  | 原问题、修复、测试数量及遗留项                                         |
| [通知验证合并记录](audit/notification-verification-2026-08-29.md)                                             | 五份测试/审查/种子报告合并，区分静态、替身测试与未做的端到端           |
| [.verify 验证证据](../.verify/v1/)、[生产阶段证据说明](evidence/phase-07/README.md)                           | 驱动、数据库/API/浏览器结果及证据范围，保留原日期                      |
| [项目过程看板](../processing_visualization.html)                                                              | 任务、问题、时间线与复盘；本次已同步需求整理与未关闭门禁               |

## 文档维护规则

- 需求变更更新现有 REQ ID、实现/测试追踪和验收案例，不再追加另一份“最终需求”。
- 同主题优先合并到现有文档；当前规范、操作手册、历史证据区分职责。
- “有代码”“有测试”“本次单测通过”“真库/浏览器通过”“生产签核”分别记录，不能互相代替。
- 保留原始 ADR、变更理由、未解决事项及有效 .verify 证据；历史文档明确时点与当前入口。
- 一次性 tmp、浏览器抓取、沙箱垫片及临时测试配置清理后不纳入版本管理。

## 本次整理（2026-10-07 至 2026-10-08）

建立完整需求链及统一测试口径，共合并/迁移/清理 19 份旧文档，清理 48 个临时文件。保留历史证据以及开始前已有的未提交修改。当前功能缺口仅记录，本轮未修改业务逻辑，也未进行生产操作。

| 原文件或材料                                                                   | 数量 | 合并或保留去向                                                                                      |
| ------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------- |
| 根目录 PRD2APP.md                                                              | 1    | [PRD 差距分析历史快照](audit/prd2app-gap-analysis-2026-08-18.md)                                    |
| 根目录 codex.v1.local.runnable.plan.md                                         | 1    | [V1 本地审计与整改台账](audit/v1-local-runnable-audit.md)                                           |
| 根目录 design-qa.md                                                            | 1    | [设计验收历史记录](../.verify/v1/design-audit-20260815.md)                                          |
| 根目录 overview.md                                                             | 1    | [流程图与架构交付说明](flowchart/README.md)                                                         |
| branch-migration-2026-08-05.md                                                 | 1    | [分支治理指南](development/git-branching.md)保留迁移映射与未完成事项                                |
| frontend-handoff-2026-08-05.md、kimi-k3-frontend-prompt.md                     | 2    | [统一前端交接](handoff/frontend-handoff.md)                                                         |
| 安全审查总览、其余项及三份高危修复报告                                         | 5    | [安全修复合并记录](audit/security-remediation-2026-08-18.md)保留问题、证据和遗留项                  |
| 通知 mock、review、verification-platform、verification-portal、acceptance 报告 | 5    | [通知验证合并记录](audit/notification-verification-2026-08-29.md)；当前口径见通知说明与统一验收手册 |
| 2026-08-11-backend-design.md、2026-08-11-frontend-design.md                    | 2    | 空白文件，删除；后续从当前需求与追踪矩阵进入                                                        |

临时文件包括 tmp 中 39 个日志/脚本/演示图片等产物、.playwright-mcp 中 3 个浏览器抓取、.t6 中 3 个沙箱垫片及 3 个一次性 Vitest 配置。删除前已将副本保存在工作区外并逐文件校验 SHA-256；有效 .verify 驱动、数据库/API/浏览器结果与设计资产继续保留。
