# 普通员工路由权限恢复设计

## 背景与根因

`DEMO-EMPLOYEE` 登录后没有任何可见菜单，访问基础页面也会被拒绝。真实 PostgreSQL 数据显示，运行库只执行到 `0012_request_replay_nonces`，`employee` 角色仍保存旧权限 `marketplace.read`；当前前端路由和后端 `PermissionGuard` 已统一使用 `catalog.read`、`demand.read`、`notification.read` 等点号权限。代码与数据库权限版本错位导致前端过滤全部菜单，后端也无法授权基础 API。

现有前端测试使用手工构造、已经包含新权限的 actor，因此无法发现未执行 migration 的真实运行态问题。

## 目标与验收标准

- 当前开发数据库应用全部待执行 migration，至少包含 `0013_unified_authorization` 和 `0014_demand_comment_likes_and_priority`。
- `DEMO-EMPLOYEE` 登录返回规范 `employee` 基础权限，并可访问应用市场、创新广场和站内通知等基础路由。
- 专项管理员继续继承 `employee` 基础权限，同时保留各自的增量权限。
- 未授权管理路由仍不可见且不可访问，不通过前端兼容旧权限绕过后端鉴权。
- 以后使用 `pnpm dev:api` 启动开发 API 时，必须先执行待应用 migration；migration 失败时 API 不启动。
- 生产启动和部署流程保持显式 migration，不改为应用进程隐式迁移。

## 方案比较

### 方案一：只手工执行 migration

优点是改动最少，可立即恢复当前数据库。缺点是后续开发者直接运行 `pnpm dev:api` 时仍可能再次跳过 migration，不能消除复发条件。

### 方案二：前端兼容旧权限别名

前端可把 `marketplace.read` 临时映射为 `catalog.read`。但后端仍按规范权限拒绝 API，请求链路会出现“菜单可见、页面不可用”的错误状态，也会延长旧权限契约寿命，因此不采用。

### 方案三：当前库迁移并强化开发启动前置检查

立即应用现有 migration 恢复运行库，同时把根命令 `dev:api` 改为先运行 `migrate`、成功后再启动 API。该方案复用现有幂等 migration，不增加双轨权限规则，并在开发入口阻断数据库版本落后，作为最终方案。

## 设计

### 开发启动流程

根 `package.json` 的 `dev:api` 串行执行 `pnpm migrate` 和 `pnpm --filter @ai-hub/api dev`。migration 非零退出时，命令停止，避免 API 在过期 schema 或权限注册表上运行。其他开发命令和生产 Compose 不改变。

### 权限数据流

`0013_unified_authorization` 继续作为唯一权限迁移来源：它覆盖规范系统角色、为 active 员工补齐 `employee` 角色，并转换已知旧权限别名。`IdentityService` 从数据库聚合角色权限并放入登录 actor；Web 的 `ROUTE_ACCESS` 与 API 的 `PermissionGuard` 消费相同规范权限。

### 测试策略

先增加一个失败的仓库脚本契约测试，证明 `dev:api` 必须在 API 开发进程前运行 migration。再实施最小 `package.json` 修改使测试转绿。

真实回归使用本地 PostgreSQL：

1. 记录 migration 前 `DEMO-EMPLOYEE` 仅有 `marketplace.read`，作为缺陷复现证据。
2. 执行 `pnpm migrate`，确认 migration 列表到达 `0014`。
3. 查询 `employee` 角色，确认包含 `catalog.read`、`demand.read`、`notification.read` 等基础权限且不再含 `marketplace.read`。
4. 通过真实登录服务或 API 登录 `DEMO-EMPLOYEE`，验证 actor 权限和基础受保护接口。
5. 运行前端权限测试、数据库权限测试、typecheck、lint 和 build，确认无回归。

如果 Docker/Testcontainers 环境不可用，则明确记录缺少的真实集成证据，不以模拟 actor 测试替代。

## 状态记录

`processing_visualization.html` 中使用 `t-026` 记录该缺陷。排查与实施期间状态为“进行中”；只有 migration、真实账号回归和质量命令全部得到新鲜证据后，才更新为“已完成”。
