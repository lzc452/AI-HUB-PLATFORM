# 2026-08-27

## AI Hub 与 Portal 应用接口统一收尾

- 按最终 Spec 审查补齐 `application_admin`/`super_admin` 对跨负责人 app 发布和下架的统一权限：Portal 先检查 `application.manage`，标准 `ApplicationService.publish/withdraw` 也允许应用管理员，同时保留普通员工负责人校验。
- 新增 PortalService 与 ApplicationService 管理员回归测试；Portal 真实 PostgreSQL 生命周期及认证兼容 E2E 继续通过。
- reconciliation CLI 的用户提示已中文化；命令、环境变量和事件标识保持英文原样。
- `processing_visualization.html` 已更新至 2026-08-27，记录管理员权限边界和测试计数。
- 全仓 `pnpm lint`/`pnpm verify` 的既有 Web 未使用变量与格式警告仍未触及；本次定向检查保持通过。

## AI-HUB-PORTAL 接口文档与持续协作交接

- 新增 `docs/handoff/ai-hub-portal-api.md`，固化 Portal 兼容路由、`ApplicationDraft` 完整请求、认证、错误码、生命周期、权限矩阵和联调验收清单。
- 文档明确 `resourceType=app` 的 Portal 写操作统一委托 `ApplicationService`，并提醒前端将 `PortalResourceItem` 映射到现有页面模型、关闭 fixture 后进行真实 API 联调。
