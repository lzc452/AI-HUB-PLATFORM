# 2026-08-26

## Portal app 统一接口最终契约补齐

- Portal app 读模型补齐 `currentVersionId`，从 `applications.current_version_id` 读取；`skill/plugin/mcp` 读模型保持原字段。
- Portal 生命周期写接口补充 `ApiProblemResponses`，统一错误 OpenAPI 引用；`ProblemDetailsDto` 增加 `issues` 项模型，明确 `DRAFT_VALIDATION_FAILED` 字段级问题契约。
- 真实 API E2E 增加双入口主读模型比较，确认草稿保存仍遵循 ApplicationService 的“草稿与主记录分阶段生效”语义。

## 验证证据

- API 装配、Portal Cookie/兼容请求头、真实 PostgreSQL 一致性与 Swagger：9 项通过。
- ApplicationService、PortalService、Problem Details：126 项通过；Portal schema/reconciliation：9 项通过；Worker：8 项通过。
- `pnpm typecheck`、server/api 定向 lint、`pnpm boundaries` 与新增文件 Prettier 检查通过。
- 全仓 `pnpm lint` 仍仅被未触及的 Web 13 个既有未使用变量阻断；`pnpm verify` 仍仅被 7 个既有格式问题阻断。
