# 2026-08-25

## AI Hub 与 Portal app 生命周期统一

- Portal 的 `app` 创建、草稿保存、版本信息、提交、审核、发布和下架统一委托 `ApplicationService`；`skill/plugin/mcp` 继续保留 Portal 原生链路。
- `ApiModule` 只创建一次 Application 动态模块，并注入 Portal、Catalog、Demand，避免服务实例与业务规则分叉。
- Portal 保持原 URL 与响应结构，增加完整 `applicationDraft` 兼容输入、审核意见/下架原因可选参数，以及 `DRAFT_VALIDATION_FAILED.issues` 透传。
- 新增 Portal app reconciliation：默认 dry-run，`--apply --expected-count` 事务 CAS 修复，安全审计保存 before/after 快照，`--rollback-batch` 幂等恢复。

## 验证证据

- Portal/Application 单元测试：119 项通过。
- Portal API Cookie/兼容请求头与共享服务装配：3 项通过。
- 真实 PostgreSQL 双入口 API：AI Hub 创建→Portal 编辑/提交/审核/下架、Portal 创建→AI Hub 读取，2 项通过。
- Portal schema 与 reconciliation（规则、dry-run、apply 幂等、rollback）：7 项通过；本地 CLI dry-run 返回零发现。
- `pnpm typecheck`、API/Server/Database 定向 lint、`pnpm boundaries` 通过。
- 复核补齐遗留 `approved` 状态缺少合法当前版本时的安全回退：无已发布事实时回到 `draft`，避免保留无效的 `approved` 状态。
- 最终审查补齐多有效审核队列的拒绝策略、reconciliation Outbox Worker handler，以及 `DRAFT_VALIDATION_FAILED.issues` 经 Problem Details 的 HTTP 透传；服务 126 项、API 9 项（含 Swagger 2 项）、Worker 8 项、数据库 9 项回归通过。

## 已知门禁

- 全仓 `pnpm lint` 与 `pnpm verify` 仍被未触及的 Web 未使用变量和既有格式问题阻断；本次改动范围内 lint/format 已通过。
