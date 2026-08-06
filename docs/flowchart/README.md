# AI Hub 平台设计流程图

本目录归档 AI Hub 平台 V1 的整体设计流程图，覆盖系统架构、核心业务流程、V1 路线图与部署运维。每张图同时提供 draw.io 源文件（`.drawio`）与 PNG 图片；源文件可在 [draw.io](https://app.diagrams.net) 或 draw.io 桌面版中直接打开、编辑和重新导出。

## 图目录

| 编号 | 文件 | 内容 |
| --- | --- | --- |
| 01 | [01-system-architecture.drawio](01-system-architecture.drawio) / [PNG](01-system-architecture.png) | 系统架构总览：Web（React SPA）→ NestJS 模块化单体 → PostgreSQL / 对象存储；Outbox Worker、监控、CI/CD 与生产环境 |
| 02 | [02-identity-organization.drawio](02-identity-organization.drawio) / [PNG](02-identity-organization.png) | 认证与组织：账密 / 钉钉 OAuth 登录、首次绑定与注册、会话管理、组织同步、RBAC 与统一鉴权 |
| 03 | [03-application-delivery-review.drawio](03-application-delivery-review.drawio) / [PNG](03-application-delivery-review.png) | 应用发布审核闭环：草稿 → 自动校验 → 人工审核池 → 上架 / 驳回 / 撤回；版本不可变、上下架与删除保护 |
| 04 | [04-innovation-demand-loop.drawio](04-innovation-demand-loop.drawio) / [PNG](04-innovation-demand-loop.png) | 创新需求闭环：需求提交 → 轻量审核 → 认领 → 方案验证 → 试点 → 转化为应用 / 关闭 / 合并 |
| 05 | [05-marketplace-interaction-governance.drawio](05-marketplace-interaction-governance.drawio) / [PNG](05-marketplace-interaction-governance.png) | 市场与互动治理：受众权限过滤、列表与搜索、详情与交付入口、点赞评价、举报隐藏与审计 |
| 06 | [06-analytics-export-assistant.drawio](06-analytics-export-assistant.drawio) / [PNG](06-analytics-export-assistant.png) | 数据看板与导出：行为事件采集、日聚合、固定看板、权限控制导出与 Dify 最小化问答 |
| 07 | [07-v1-roadmap.drawio](07-v1-roadmap.drawio) / [PNG](07-v1-roadmap.png) | V1 实施路线图：8 个阶段、门禁、里程碑 M1–M9 与全局约束 |
| 08 | [08-deployment-operations.drawio](08-deployment-operations.drawio) / [PNG](08-deployment-operations.png) | 部署与运维：双机拓扑、CI/CD 发布、备份恢复、监控告警与故障降级 |
| 09 | [09-data-flow-loop.drawio](09-data-flow-loop.drawio) / [PNG](09-data-flow-loop.png) | 数据流转闭环：登录 → 上传 → 审核（通过 / 修改重审 / 驳回）→ 上架 → 发现 / 查看 / 互动 → 应用（下载 / 跳转 / 扫码）→ 数据聚合反哺，含角色节点与数据存储依赖 |

## 使用说明

- 编辑：用 draw.io 打开 `.drawio` 文件即可修改；`docs/flowchart/` 下的 SVG 为同源预览。
- 重新生成：`node docs/flowchart/tools/generate-flowcharts.mjs` 会按内置定义重建全部 `.drawio` 与 `.svg` 文件（PNG 为渲染导出产物，不随脚本重建）。
- 内容依据：V1 [设计规格](../superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md)、[V1 项目路线图](../superpowers/plans/2026-07-31-ai-hub-v1-program-roadmap.md) 与当前仓库代码结构。
