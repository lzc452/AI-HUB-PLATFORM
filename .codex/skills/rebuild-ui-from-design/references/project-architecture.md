# 项目架构检查

## 目标

在修改前形成 `ArchitectureImpact`，保护现有 React、React Router、Ant Design、TailwindCSS、TanStack Query 和 Vitest 架构。环境配置和 package 版本以仓库当前文件为准，不复制可能过期的版本表。

## 检查顺序

1. 确认 `packages/ui/src` 中的目标 PNG、原始尺寸和可能的页面映射。
2. 仓库存在 `.codegraph/` 时，优先运行 `codegraph explore` 查询目标页面、入口符号、调用路径和共享组件；只在无法回答时再用 `rg --files` 或源码阅读补充。
3. 读取 `apps/web/src/router`、目标 `pages`、关联 `modules`、`components/layout`、`components/common`、`shared/ui`、`providers.tsx`、`styles.css` 和 `packages/ui/src/theme.ts`。
4. 搜索目标公共组件和 Ant Design 组件的全部调用点，建立全局主题或选择器的影响范围。
5. 读取目标页面测试及其测试 setup，确定可复用的行为断言和截图入口。

## 必填产物

```text
ArchitectureImpact
- targetImage
- targetRoute
- pageEntry
- callPaths
- dataHooks
- permissionGuards
- existingCommonComponents
- pageLocalComponents
- themeFiles
- affectedRoutes
- verificationCommands
```

## 边界规则

- `pages` 只编排页面和状态组合；API、hooks、查询缓存和业务状态留在 `modules`。
- 路由、认证、权限、数据契约和现有交互行为保持不变。
- 先盘点 `apps/web/src/components/common`，跨页面复用优先扩展已有组件。
- 相同视觉与交互模式出现于两个及以上路由时，公共实现必须位于 `apps/web/src/components/common`。
- 公共组件通过 props 接收页面数据，不在组件内部偷偷请求页面业务数据。
- 修改 `packages/ui/src/theme.ts` 或全局 CSS 前，列出所有调用点和受影响路由；修改后逐页验证。

## 影响清单示例

```text
目标：组织管理-角色管理.png → /organization?tab=roles
入口：apps/web/src/pages/organization/OrganizationPage.tsx
共享候选：apps/web/src/components/common/{KpiCard,StatCard,...}
业务来源：apps/web/src/pages/organization/components/roles + modules/auth
主题文件：packages/ui/src/theme.ts；apps/web/src/styles.css
回归路由：组织管理用户、部门、同步状态及所有使用同一表格/筛选器的页面
```
