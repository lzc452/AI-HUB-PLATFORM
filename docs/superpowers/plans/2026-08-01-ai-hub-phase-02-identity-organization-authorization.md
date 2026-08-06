# AI Hub 阶段 2 身份、组织与授权实施计划

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

> **执行状态（2026-08-03）：** 阶段 2 V1 范围已完成。在 Docker/Testcontainers 可用环境下完整 `pnpm verify` 通过。剩余风险为外部钉钉 OAuth 凭据与部署相关的安全策略。

**目标：** 交付阶段 3 所需的 V1 身份、组织、会话、钉钉绑定/同步、RBAC、受众与统一授权基线。

**架构：** 阶段 2 在 `packages/server` 中实现为深度 `identity` 模块，由 `packages/database` 中的 Kysely 表与 `packages/contracts` 中的稳定契约支撑。API 端点只调用公开的服务接口，所有状态变更流程都在同一个 PostgreSQL 事务边界内发出审计/outbox 事件。

**技术栈：** Node.js >=18.18、TypeScript 严格模式、NestJS 10、Kysely、PostgreSQL 18、Vitest、React/Vite/Ant Design。

## 全局约束

- 单企业、单实例；不引入 `tenant_id`。
- 员工 ID 是不可变、永不复用的员工主键。
- 密码是本地兜底凭据，必须强哈希存储。
- 钉钉不可用不得阻断已配置密码员工的密码登录。
- 授权拒绝不得暴露受限对象是否存在。
- 角色、组织、禁用/归档与密码重置变更必须撤销相关会话。
- V1 不使用 Redis、消息队列、Elasticsearch、Kubernetes、公开 Open API 或微服务。

---

## 文件结构

```text
packages/contracts/src/identity.ts
packages/database/src/migrations/0002_identity_organization_authorization.ts
packages/database/src/schema.ts
packages/server/src/identity/
  identity.types.ts
  password.service.ts
  password.service.test.ts
  identity.repository.ts
  identity.service.ts
  identity.service.test.ts
  identity.controller.ts
  identity.module.ts
apps/api/src/api.module.ts
apps/api/test/identity.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/App.test.tsx
processing_visualization.html
```

## 本阶段产出的稳定接口

```ts
export type EmployeeId = string;
export type ResourceId = string;

export interface ActorContext {
  employeeId: EmployeeId;
  roleCodes: readonly string[];
  departmentIds: readonly string[];
  primaryDepartmentId: string;
  sessionId: string;
}

export interface AuthorizationRequest {
  actor: ActorContext;
  action: string;
  resourceType: string;
  resourceId?: ResourceId;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: string;
}
```

## 任务

### 任务 1：契约与数据库基线

**文件：**
- 创建 `packages/contracts/src/identity.ts`
- 修改 `packages/contracts/src/index.ts`
- 创建 `packages/database/src/migrations/0002_identity_organization_authorization.ts`
- 修改 `packages/database/src/migrate.ts`
- 修改 `packages/database/src/schema.ts`

**验收标准：** 迁移在不使用 `tenant_id` 的前提下创建员工、部门、成员关系、角色、用户角色、会话、钉钉绑定、钉钉同步记录、密码重置挑战与审计事件。


### 任务 2：密码、会话与本地登录

**文件：**
- 创建 `packages/server/src/identity/password.service.ts`
- 创建 `packages/server/src/identity/identity.service.ts`
- 在两个服务旁创建测试。

**验收标准：** 仅含 ASCII、8 位以上的密码使用 `crypto.scrypt` 哈希；活跃员工可登录成功且不撤销无关会话；禁用/归档/待绑定员工不能通过密码登录。


### 任务 3：组织与钉钉同步端口

**文件：**
- 扩展 `identity.service.ts`
- 为部门、成员关系与钉钉绑定添加仓库方法。

**验收标准：** 本地记录可编辑；本地编辑不会覆盖钉钉来源字段；每日/手动同步可审计；首次 OAuth 绑定以员工 ID 为键。


### 任务 4：RBAC 与统一授权

**文件：**
- 扩展契约与 `identity.service.ts`
- 添加受众评估器接口。

**验收标准：** 预定义/自定义平台角色解析为 `ActorContext`；`authorize()` 返回通用拒绝原因码，且在权限/受众规则之前绝不检查对象是否存在。


### 任务 5：API 与 Web 管理界面

**文件：**
- 创建 `identity.controller.ts` 与 `identity.module.ts`
- 修改 `apps/api/src/api.module.ts`
- 修改 web 外壳路由。

**验收标准：** 内部管理端点暴露当前操作者、角色、员工、部门、本地登录、登出与会话撤销原语；Web 外壳的组织/安全占位页面已接入路由。


### 任务 6：验证与门禁

**文件：**
- 添加 e2e 测试并更新 `processing_visualization.html`。

**验收标准：** `pnpm verify` 通过；定向身份测试通过；文档记录阶段 2 决策与剩余的外部钉钉凭据风险。
