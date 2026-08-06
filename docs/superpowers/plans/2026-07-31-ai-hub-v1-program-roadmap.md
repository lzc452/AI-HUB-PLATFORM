# AI Hub V1 项目实施方案

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**Goal:** 在 9 个月内交付单企业私有化的 AI 应用共享平台 V1，并完成试点、双机部署和正式上线。

**Architecture:** 采用 React SPA + NestJS 模块化单体。HTTP 入口、后台 worker 和前端来自同一个 pnpm monorepo；业务状态、会话、事务发件箱和聚合数据以 PostgreSQL 为主数据源，文件经对象存储隔离、扫描和发布。

**技术栈：** Node.js 24 LTS、pnpm 11、TypeScript 5.9、React 19.2、Vite 8.1、Ant Design 6、Tailwind CSS 4、NestJS 11、PostgreSQL 18、Kysely、Vitest、Playwright、Docker Compose。

## 全局约束

- 单企业、单实例，不包含 `tenant_id`。
- 企业员工少于 5,000 人，平台实际用户不超过 500 人。
- 工号是唯一、不可变、永久不复用的员工主键。
- 生产使用两台 Ubuntu Server 和 Docker Compose，目标为 99.5% 可用性、RPO 15 分钟、RTO 2 小时。
- 开发与测试使用本地 Windows、Docker Desktop Linux 容器和 Docker Compose。
- 前端使用 Ant Design 默认主题与 Tailwind CSS；禁止大量渐变按钮、渐变图标和装饰性动画。
- 后端按深模块组织，模块外只能访问公开 interface。
- V1 不引入微服务、Redis、消息队列、Elasticsearch、Kubernetes 或公共 Open API。
- 对象存储只通过 S3 兼容适配器接入；开发环境镜像在 Phase 1 固定，生产实现与维护状态必须在 Phase 7 再评估并记录 ADR，避免把已归档的具体产品变成架构依赖。
- 业务、权限、安全、审计和可观测性必须随功能一同完成，不能在第 8 月集中补做。
- 所有状态变化必须通过后端授权、事务和并发控制。
- 新增功能默认进入 V1.1；必须进入 V1 时应移除等量现有范围。
- 第 8 月末功能冻结；第 9 月只处理试点、缺陷、培训、演练和上线。

---

## 1. 为什么拆成计划套件

总规格包含多个可以独立验收的子系统。一次性编写未来 9 个月所有具体文件和函数会造成两个问题：

1. 前一阶段建立的真实 interface 可能与九个月前猜测的名称不一致。
2. 后续计划会鼓励实现者遵循过时路径，而不是已通过测试的代码结构。

因此采用“主路线 + 阶段计划”的方式：

- 本文件锁定阶段顺序、依赖、交付门禁和跨阶段 interface。
- 每个阶段开始前生成独立的详细实施计划。
- 阶段计划必须列出精确文件、类型、失败测试、验证命令和提交边界。
- 只有当前阶段门禁通过，才能编写和执行下一阶段计划。

当前可执行计划：

- `docs/superpowers/plans/2026-07-31-ai-hub-phase-01-foundation.md`

## 2. 代码所有权地图

```text
apps/
  web/                 浏览器入口和业务界面
  api/                 NestJS HTTP 入口
  worker/              NestJS 后台任务入口
packages/
  contracts/           Zod 契约、共享类型和错误码
  config/              运行时配置解析
  database/            Kysely、连接、migration 和事务基础
  server/              后端业务深模块
  ui/                  Ant Design 主题、通用 UI 和设计令牌
  testing/             测试构造器、fake adapter 和固定样例
infra/
  docker/              镜像、Compose、健康检查和本地依赖
  monitoring/          Prometheus、Grafana 和告警配置
scripts/               跨平台质量、migration、发布和运维命令
docs/
  superpowers/         规格与阶段计划
  adr/                 架构决策
  runbooks/            部署、故障、备份和恢复手册
```

模块拥有自己的状态与表。除分析读取模型和受控 migration 外，不允许跨模块直接写表。

## 3. 跨阶段稳定 interface

后续计划应复用以下名称；若阶段执行中必须更名，应先更新本路线和已存在的后续计划。

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

export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: TPayload;
}
```

HTTP 错误使用统一形状：

```ts
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  traceId: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}
```

## 4. 阶段顺序

### Phase 1：工程基础与可运行骨架

**目标月份：** 第 1 月

**交付：**

- pnpm monorepo、TypeScript、ESLint、Prettier 和模块依赖检查。
- React/Vite/Ant Design/Tailwind 应用壳。
- NestJS API、worker、运行时配置和结构化日志。
- PostgreSQL、Kysely、migration 和事务发件箱基础。
- Windows 开发与测试 Compose。
- GitLab CI 和本地等价质量命令。
- liveness、readiness、metrics 和请求追踪。

**详细计划：**

- `docs/superpowers/plans/2026-07-31-ai-hub-phase-01-foundation.md`

**门禁：**

- 新 Windows 环境可按文档在 30 分钟内启动。
- `pnpm verify` 全部通过。
- API、worker、web、PostgreSQL、MinIO 和 ClamAV 在 Compose 中健康。
- API readiness 能检测数据库不可用。
- 模块依赖违规会使 CI 失败。

### Phase 2：身份、组织与授权

**目标月份：** 第 2 月

**交付：**

- 工号密码登录、强哈希、会话、多设备和最低限流。
- 钉钉 OAuth 首次绑定、自动注册和首次设密。
- 用户、部门、多部门成员和双来源组织数据。
- 钉钉事件、每日校准和手工同步。
- 预置角色、自定义角色和平台级 RBAC。
- 统一 Authorization 模块、受众表达式和禁止自审策略。
- 会话撤销、密码重置和用户归档。

**计划编写门禁：**

- Phase 1 的配置、数据库、契约、错误和测试 interface 已稳定。
- 已取得钉钉测试应用、回调地址和通讯录权限。

**完成门禁：**

- 身份与组织端到端流程通过。
- 钉钉不可用时已有密码员工仍可登录。
- 角色、组织和禁用变化能撤销必要会话。
- 授权拒绝不泄露对象存在性。

### Phase 3：应用、版本、交付与审核

**目标月份：** 第 3–4 月

**交付：**

- 应用身份、责任人、维护人和归属部门。
- 不可变 ApplicationVersion。
- Web、桌面、移动和小程序交付配置。
- 分片上传、隔离、哈希、扫描、签名和存储复制。
- 发布向导和详情预览。
- 自动校验、公共审核池、领取、驳回、撤回和禁止自审。
- 上下架、归档、物理删除边界和版本替换。
- 审核 SLA 和工作通知事件。

**计划编写门禁：**

- Phase 2 的 ActorContext、Authorization 和组织 interface 已稳定。
- 文件扫描、MinIO 和 2GB 续传技术验证已经通过。

**完成门禁：**

- 四类应用都能完成端到端发布。
- 新版本审核期间旧版本持续可用。
- 扫描失败或无效签名文件不能进入人工审核。
- 审核通过后的应用无法物理删除。

### Phase 4：市场、搜索、互动与创作者中心

**目标月份：** 第 5 月

**交付：**

- 权限过滤后的列表、推荐、最新、热门、分类、标签和搜索。
- PostgreSQL 中文模糊、拼音和首字母搜索读取模型。
- 应用详情和授权交付入口。
- 点赞、评分、匿名评价、官方回复、举报和隐藏。
- 创作者中心、版本差异、自动校验报告和单应用数据。
- 站内通知中心和钉钉投递重试。
- 基础健康检查、待移交和废弃标签。

**完成门禁：**

- 未授权应用不会出现在任何查询或交付入口。
- 评价匿名对普通用户成立，审计人员可追溯且查询行为被记录。
- 目标 Web 使用、下载和二维码动作按准确口径计数。

### Phase 5：AI 需求与创新广场

**目标月份：** 第 6 月

**交付：**

- 结构化需求表单和轻量审核。
- 受众、展示匿名、点赞、补充讨论和举报。
- 认领方案、负责人、协作者和运营选择。
- 业务价值、成本、风险和管理员优先级。
- 状态推进、官方进展、试点和关闭。
- 需求合并。
- 需求与应用多对多关联和主要解决方案。

**完成门禁：**

- 需求从提交到应用正式上架形成完整闭环。
- 合并、认领和状态推进均有并发保护与审计。
- 匿名和受众规则与应用侧保持一致。

### Phase 6：分析、看板、导出与外部助手

**目标月份：** 第 7 月

**交付：**

- 原始行为事件、180 天保留和日聚合。
- 平台、市场、应用、创新、审核、部门、风险、运行和集成固定看板。
- 受权限控制的后台导出。
- 公网 Dify 最小化上下文、脱敏、授权复核和降级。
- 钉钉工作通知完整矩阵。
- 指标口径字典。

**完成门禁：**

- 看板数字可从原始事件重算并一致。
- 单应用负责人不能查看个人访问名单。
- Dify 无法获得工号、内网 URL、文件、二维码和匿名身份。
- 导出行为全部审计。

### Phase 7：生产安全、部署与运维

**目标月份：** 第 8 月

**交付：**

- Ubuntu 双机 production Compose。
- Keepalived 或内部 DNS 切换方案。
- PostgreSQL 流复制、WAL 归档和人工提升。
- 对象存储异步复制和人工切换。
- Prometheus、Grafana、Alertmanager 和集中日志。
- TLS、CSP、CSRF、SSRF、防重放和供应链扫描。
- CI 不可变镜像、升级、回退和 migration 门禁。
- 备份、恢复和故障手册。

**计划编写门禁：**

- 两台生产服务器、网络、证书和出站白名单已可用。
- 独立备份介质有明确负责人和容量。

**完成门禁：**

- 生产 Release Candidate 可部署。
- PostgreSQL、对象存储、镜像和配置恢复演练通过。
- RPO、RTO 和 99.5% 目标有可验证证据。

### Phase 8：试点与正式上线

**目标月份：** 第 9 月

**交付：**

- 3–5 个部门、30–50 名员工、5–10 个真实应用试点。
- UAT、缺陷分级和修复。
- 用户、发布者、运营、管理员和运维手册。
- 数据初始化、角色授予和钉钉工作台入口。
- 上线演练、正式切换和回退窗口。
- 90 天运营指标基线。

**完成门禁：**

- 没有未关闭的 P0/P1 缺陷。
- 权限、文件安全、备份恢复和外部集成验收通过。
- 企业上线批准人签字确认。

## 5. 每阶段计划的强制结构

后续每份阶段计划必须：

- 以 `writing-plans` 规定的 header 开始。
- 列出精确创建、修改和测试文件。
- 定义与相邻阶段共享的 interface。
- 每个任务先写失败测试，再写最小实现。
- 每个任务独立提交。
- 提供 Windows Docker Compose 验证命令。
- 对安全、权限、审计和错误路径给出具体测试。
- 结束前运行规格覆盖、占位词和类型一致性自审。

## 6. 变更控制

- 当前路线与批准规格共同构成 V1 基线。
- 更改稳定 interface 必须更新本路线、当前计划和受影响 ADR。
- 任何新增 V1 功能都必须附带删除项、工期影响和验收变化。
- 第 8 月开始仅接受阻塞上线、安全和数据完整性问题。
