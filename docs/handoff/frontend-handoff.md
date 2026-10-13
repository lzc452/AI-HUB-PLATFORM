# 前端交接与维护指南

更新日期：2026-10-07。本文合并早期前端交接文档与构建提示词，保留维护约定；原先关于两文件静态 SPA、旧认证路由和待安装依赖的描述已过时。

## 开发入口

- 本地启动与热更新见 [开发指南](../development/README.md)，Windows 容器问题见 [Docker Compose 指南](../development/windows-docker-compose.md)。
- 业务范围、角色、需求变更与验收以[当前需求基线](../requirements/README.md)和[统一验收手册](../requirements/acceptance.md)为准；历史 UI 设计不覆盖当前导航或状态机。
- 页面视觉、间距与状态以 [前端 UI 设计文档](../ui-design/frontend-ui-design.md) 和 [原始设计图](../../packages/ui/src/) 为依据。
- Portal 联调使用 [接口对接文档](ai-hub-portal-api.md)；管理端与 Portal 的路径见 [路由部署约定](../deployment/portal-console-routing.md)。
- 依赖与脚本以 [Web package.json](../../apps/web/package.json) 为准；React Hook Form、Zod、ECharts、Motion 等已在依赖中。

## 目录与职责

| 位置                              | 职责                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `apps/web/src/pages/`             | 路由页面，组合组件与模块 hooks，处理加载、错误、空态和权限状态 |
| `apps/web/src/components/layout/` | 公共壳层、导航与布局                                           |
| `apps/web/src/components/common/` | 跨页面复用组件，通过 props 接收业务数据                        |
| `apps/web/src/modules/`           | 领域 API 客户端、TanStack Query hooks、缓存与业务状态          |
| `apps/web/src/router/`            | 路由、路径与访问守卫                                           |
| `apps/web/src/shared/`            | API 请求、通用 UI 与基础设施                                   |
| `packages/contracts/src/`         | 前后端共享类型与数据契约                                       |
| `packages/ui/src/theme.ts`        | Ant Design 主题                                                |
| `apps/web/src/test/`              | 测试环境与公共测试支持                                         |

页面通过已有模块 hooks 获取数据，模块使用共享请求客户端。公共组件不直接请求页面业务数据；共享层避免依赖页面。修改公共组件、主题或全局 CSS 时，核对全部调用点并验证受影响页面。更详细的影响分析见 [项目架构规则](../../.codex/skills/rebuild-ui-from-design/references/project-architecture.md)。

## API 与认证

- 复用 [共享 API 客户端](../../apps/web/src/shared/api/client.ts) 的 `apiFetch`、`apiFetchBlob` 和上传方法，统一处理认证、错误、下载文件名与上传进度。
- 浏览器使用同源 HttpOnly Cookie 携带身份，共享客户端不注入 `x-employee-id` / `x-session-id`。兼容身份请求头供非浏览器客户端使用，具体接口约定见 Portal 对接文档。
- 写请求由共享客户端附带 `csrf_token` 对应的 `x-csrf-token`，以及 `x-request-nonce`、`x-request-timestamp`。
- [会话存储](../../apps/web/src/modules/auth/session.store.ts) 仅持久化非敏感 `employeeId` 提示，会话令牌不写入 `localStorage`；最终身份以服务端 actor 为准。
- 错误通过 `ApiError` 保留 `status`、`code`、`detail`、`traceId` 和校验 `issues`，页面显示真实失败反馈。
- 受众可见性与业务授权在服务端执行；前端菜单、路由与按钮权限不能替代服务端校验。权限口径见 [访问控制矩阵](../access-control-matrix.md)。

## 页面维护约定

- 用户可见文案使用简体中文，匿名展示尊重 `displayAnonymously`。
- 交互控件复用 Ant Design，布局与间距使用既有 Tailwind 样式；避免 `!important` 覆盖组件内部样式。
- 服务端状态使用既有 TanStack Query 查询与缓存，跨层类型复用 `@ai-hub/contracts`。
- 保留语义化标题、导航名称、跳过链接、键盘访问与可见焦点；动效尊重 `prefers-reduced-motion`。
- 验证桌面、平板和手机布局，以及 loading、empty、error、403、hover、focus、selected、disabled 状态；实际视觉视口以 UI 设计规范为准。

## 验证

针对修改运行相关测试，再按影响范围执行：

```powershell
pnpm --filter @ai-hub/web test
pnpm --filter @ai-hub/web typecheck
pnpm --filter @ai-hub/web lint
pnpm --filter @ai-hub/web build
```

仓库完整门禁使用 `pnpm verify`。历史浏览器流程、角色矩阵和人工视觉复核限制见 [V1 浏览器验收](../../.verify/v1/browser/browser-acceptance.md)；历史记录中的测试通过数量不代表本次改动已验证。
