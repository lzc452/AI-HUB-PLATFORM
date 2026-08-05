# 演示账号与组织架构初始化设计

## 背景

当前身份迁移只初始化系统角色，没有初始化部门、员工、部门成员关系或员工角色关系。登录接口要求员工状态为 `active`、存在 scrypt 密码哈希且不要求密码重置，因此本地开发和测试环境缺少可直接登录的完整数据集。

## 目标

- 提供五个与组织架构设计对应的可登录测试账号：普通员工、应用管理员、创新运营管理员、组织管理员、超级管理员。
- 初始化演示部门树、员工主部门、部门成员关系、角色定义和员工角色关系。
- seed 可重复执行，不删除其他业务数据；仅面向本地/测试环境，不让生产启动流程自动创建演示账号。
- 用自动化测试验证 seed 数据和现有密码登录链路。

## 非目标

- 不修改正式业务账号、钉钉同步、登录协议或会话生命周期。
- 不把演示账号写入数据库迁移；生产环境只执行正式迁移。
- 不为演示账号创建应用、需求、通知或分析业务数据。

## 账号与组织数据

部门树使用本地来源：`demo-company`（演示企业）为根节点，下设 `demo-rnd`（研发中心）、`demo-innovation`（创新运营部）和 `demo-admin`（平台管理部）。

| 工号 | 展示名 | 主部门 | 角色 | 本地测试密码 |
| --- | --- | --- | --- | --- |
| `DEMO-EMPLOYEE` | 演示普通员工 | 研发中心 | `employee` | `Demo-Employee-2026!` |
| `DEMO-APP-ADMIN` | 演示应用管理员 | 研发中心 | `application_admin` | `Demo-AppAdmin-2026!` |
| `DEMO-INNOVATION` | 演示创新运营管理员 | 创新运营部 | `demand_operator` | `Demo-Innovation-2026!` |
| `DEMO-ORG-ADMIN` | 演示组织管理员 | 平台管理部 | `organization_admin` | `Demo-OrgAdmin-2026!` |
| `DEMO-SUPER-ADMIN` | 演示超级管理员 | 平台管理部 | `super_admin` | `Demo-SuperAdmin-2026!` |

密码只用于本地/测试环境，使用现有 `PasswordService` 生成 scrypt 哈希；数据库只保存哈希，不保存明文密码。`application_admin` 作为系统角色授予应用创建、读取、更新、审核、发布和 creator 汇总读取权限；`demand_operator` 作为系统角色覆盖需求全流程权限并保留现有业务代码对该角色的识别。已有 `employee`、`organization_admin` 和 `super_admin` 定义沿用当前迁移内容。

## 实现方案

新增独立的 `pnpm seed:demo-accounts` 命令。命令读取 `DATABASE_URL`，使用现有数据库连接和身份密码服务，在一个事务中幂等 upsert 部门、角色、员工、成员关系和员工角色关系。演示工号是固定的，重复执行会把演示账号恢复为 active 并刷新其本地测试密码；不会触碰非演示数据，也不会删除任何数据。

开发 Compose 的 API 启动命令在正式迁移成功后调用该 seed；生产 Compose 不调用。脚本只输出初始化数量，不输出密码哈希或明文凭据。README 记录开发地址、执行命令和这五组测试凭据。

## 验证

- 数据库集成测试：首次 seed 写入预期的部门、角色、员工、成员关系和角色绑定；重复 seed 不产生重复行并更新演示账号状态/哈希。
- 登录集成测试：使用真实 Kysely identity repository 和 `IdentityService.loginWithPassword()` 验证五个账号均能成功登录，并返回预期 `roleCodes` 和有效会话。
- 运行相关数据库/API 测试、类型检查、lint、格式检查；完成后更新根目录 `processing_visualization.html`。

## 安全边界

演示账号仅允许用于开发和测试。生产部署文档不提供 seed 命令，生产 Compose 不自动执行 seed；如果未来需要生产初始化账号，必须走组织管理员/密码重置流程，而不是复用这批固定凭据。
