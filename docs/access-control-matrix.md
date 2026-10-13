# 前后端访问控制矩阵

本表配套[当前需求基线](requirements/README.md)，用于路由、菜单及主要 API 的权限速查。真正的授权依据是 actor 的 `permissions`，还须满足会话、资源范围和状态条件。当前仅允许新增分发 `employee`、`super_admin`；表中的专业角色表示既有权限持有人，不表示可以继续分发。既有专业/自定义角色的分配可以保留或移除，运行授权仅合并 active 角色权限；停用不删除分配记录，广播排除停用角色/员工。GAP-03 的真实 Cookie 会话撤权回归已通过，详见[实施门禁](requirements/gates.md)。

## 当前角色分发与权限

| 系统角色 | 当前默认权限 | 说明 |
|---|---|---|
| `employee` | `catalog.read`、`identity.department.read`、`notification.read`、`notification.create`、`interaction.interact`、`application.create`、`application.publish`、`application.read`、`application.update`、`creator.read`、`demand.create`、`demand.read`、`demand.update`、`demand.submit`、`demand.claim`、`demand.interact` | 16 项基础权限；资源级负责人/维护人/受众检查仍生效，默认没有应用/需求审核、需求进度或协作管理权限 |
| `super_admin` | `*` | 全量权限；仍不能绕过数据存在性、状态和审计约束 |

既有专业角色权限定义统一查阅[系统角色 registry](../packages/database/src/authorization/system-roles.ts)，运行时以实际数据库权限为准。角色定义存在、迁移源码存在与部署已执行分别取证。`*` 只在权限匹配时表示全量，不应写入新的业务权限码。应用负责人/维护人是资源关系，不能自动推导为 `application_owner` 等通知角色编码；广播/矩阵授权差异见 `GAP-02`。

## 一、前端页面路由—左侧菜单—角色权限

| 页面/用途 | Route | 左侧菜单 | 前端访问权限 | 权限持有人（专业角色仅指既有分配） | 资源级条件与说明 |
|---|---|---|---|---|---|
| 登录 | `/login` | 不显示 | Public | — | 成功后创建会话并恢复 actor |
| 首页重定向 | `/` | Logo/首页 | 已认证且具备 `catalog.read` | `employee` 及其专业角色、`super_admin` | 重定向到 `/marketplace` |
| 应用市场 | `/marketplace` | 应用市场 | `catalog.read` | 所有在职员工及其专业角色 | 目录服务只返回已发布且在受众范围内的应用 |
| 应用市场详情 | `/marketplace/:applicationId` | 应用市场（详情不单列） | `catalog.read` | 所有在职员工及其专业角色 | 目录受众不匹配返回 `404`，资产读取复用相同边界 |
| 创新广场 | `/innovation` | 创新广场 | `demand.read` | 所有在职员工及其专业角色 | 需求列表按公开、部门、员工受众过滤 |
| 创新需求详情 | `/innovation/:demandId` | 创新广场（详情不单列） | `demand.read` | 所有在职员工及其专业角色 | 受众、状态和匿名投影由服务层校验 |
| 应用管理 | `/applications` | 应用管理 | `application.read`、`application.manage` 或 `application.review` | `employee`（负责人/维护者）、`application_admin`、`super_admin`（custom role 以实际权限为准） | 列表与 KPI 由服务层按负责人/维护者范围过滤，管理员与审核员保持全量 |
| 应用管理详情 | `/applications/:applicationId` | 应用管理 > 应用详情 | `application.read` | `employee`（负责人/维护者）、`application_admin`、`super_admin` | 普通员工只能查看自己负责或维护的应用 |
| 版本管理 | `/applications/:applicationId/versions` | 应用管理 > 版本管理 | `application.read` | `employee`（负责人/维护者）、`application_admin`、`super_admin` | 写操作还需 `application.update` 和负责人（owner）条件；维护者当前只读 |
| 审核工作台 | `/applications/:applicationId/review` | 应用管理子页（无一级审核菜单） | `application.review` | `super_admin` 或既有审核权限持有人 | 应用负责人及所有维护人均不得自审；仅队列认领者裁决 |
| 交付配置 | `/applications/:applicationId/delivery` | 应用管理 > 交付配置 | `application.update` | `employee`（负责人/维护者）、`application_admin`、`super_admin` | 仅负责人（owner）可修改交付渠道；维护者当前只读 |
| 创作者中心 | `/creator/:applicationId` | 不作为一级菜单 | `creator.read` | `employee`（负责人/维护者）、`application_admin`、`super_admin` | 聚合数据只允许负责人或维护者读取 |
| 数据看板 | `/analytics` | 数据看板 | 任一 `analytics.<segment>.read` | 对应 `analytics_<segment>_reader`、`analytics_exporter`、`analytics_assistant_user`、`analytics_operator`、`application_admin`、`demand_operator`、`organization_admin`、`department_lead`、`risk_operator`、`super_admin`（`analytics_identity_export` 仅用于身份字段导出） | 页面按照 actor 的具体权限过滤看板卡片，不因进入页面而放开全部看板 |
| 组织管理 | `/organization` | 组织管理 | `identity.employee.read` 且 `identity.department.read` | `organization_admin`、`super_admin` | 组织范围、字段脱敏和角色明细由 API 再校验 |
| 系统安全 | `/security` | 系统安全 | `security.read` | `super_admin` | 审计、会话和安全配置页面 |
| 站内通知 | `/notifications` | 站内通知 | `notification.read` | 所有拥有基础角色的在职员工及其专业角色 | 列表与已读操作仅限当前员工；投递重试另需 `notification.deliver` |
| AI 助手 | `/assistant` | 当前无一级入口，保留路由 | `analytics.assistant.use` | `super_admin` 或既有助手权限持有人 | 指标与范围仍校验；当前生产 Dify 端口 unavailable，不能描述为真实问答已启用 |

路由守卫和 `Navigation` 必须引用同一份权限配置。actor 尚未恢复时菜单不渲染且路由处于 loading，不得把 `actor = null` 当成“全部允许”；无权限访问路由显示 `ForbiddenBlock`。退出或切换账号时清理用户级查询缓存和最近访问应用 ID。

## 二、后端 API—权限—角色

下表保留主要接口速查，不声称枚举全部端点。新增挑战登录、部门成员、完整草稿、统一上传、认领方案和 Portal 接口详见[需求追踪](requirements/traceability.md)、[Portal 手册](handoff/ai-hub-portal-api.md)和当前 controller/Swagger。`资源条件` 是静态 Guard 之外必须保留的服务层约束；专业角色名仅为既有权限配置示例。

### Identity、系统和目录

| Method | Path | Guard 权限 | 可用系统角色 | 资源条件 |
|---|---|---|---|---|
| GET | `/internal/identity/employees` | `identity.employee.read` | `organization_admin`、`super_admin` | 按组织范围读取员工摘要 |
| GET | `/internal/identity/departments` | `identity.department.read` | `employee`、`organization_admin`、`super_admin` | 只返回当前账号可见的部门树 |
| GET | `/internal/identity/employees/:employeeId/roles` | `identity.role.read` | `organization_admin`、`super_admin` | 不能越过组织范围读取角色 |
| POST | `/internal/identity/employees/:employeeId/revoke-sessions` | `identity.session.manage` | `organization_admin`、`super_admin` | 可撤销目标员工会话，写入审计事件 |
| GET | `/internal/identity/actor` | Authenticated | 所有已登录角色 | 首选 HttpOnly Cookie，兼容身份请求头；employeeId 与 sessionId 必须属于同一有效会话 |
| POST | `/internal/identity/logout` | Authenticated | 所有已登录角色 | 只能撤销当前 actor 的 session，不能提交其他员工或会话 ID |
| POST | `/internal/identity/login/password` | Public | — | 先取得 challenge，再提交加密 envelope；校验员工状态、挑战与账号/IP 限流 |
| GET | `/internal/health/live` | Public | — | 仅存活探针，不返回业务数据 |
| GET | `/internal/health/ready` | Public | — | 仅就绪探针；数据库检查结果不包含敏感信息 |
| GET | `/internal/metrics` | Public（网络边界） | — | 仅允许部署网络或监控网段访问 |
| GET | `/internal/catalog` | `catalog.read` | 所有在职员工及其专业角色 | 已发布、受众和分页条件过滤 |
| GET | `/internal/catalog/:applicationId` | `catalog.read` | 所有在职员工及其专业角色 | 已发布且满足受众，否则目录对象统一返回 `404` |
| POST | `/internal/catalog/:applicationId/actions` | `catalog.read` | 所有在职员工及其专业角色 | 只能记录可见应用的合法交付行为 |

### Application、Creator 和 Interaction

| Method | Path | Guard 权限 | 可用系统角色 | 资源条件 |
|---|---|---|---|---|
| POST | `/internal/applications` | `application.create` | `employee`、`application_admin`、`demand_operator`、`super_admin`（custom role 以实际权限为准） | 创建者必须是当前 actor；所有在职员工可创建草稿并提交应用（规格 §5.4） |
| GET | `/internal/applications/admin-list` | `application.read`、`application.manage` 或 `application.review` | `employee`（负责人/维护者）、`application_admin`、`super_admin`（custom role 以实际权限为准） | 非管理账号只返回本人负责人或维护者的应用 |
| GET | `/internal/applications/admin-kpis` | `application.read`、`application.manage` 或 `application.review` | `employee`（负责人/维护者）、`application_admin`、`super_admin`（custom role 以实际权限为准） | KPI 仅统计当前账号可见范围；非管理账号按负责人/维护者过滤 |
| POST | `/internal/applications/:applicationId/versions` | `application.update` | `employee`、`application_admin`、`super_admin` | 负责人（owner），且应用未归档；维护者当前不能写入 |
| PUT | `/internal/applications/:applicationId/deliveries/:channel` | `application.update` | `employee`、`application_admin`、`super_admin` | 负责人（owner）；渠道和版本状态合法 |
| POST | `/internal/applications/versions/:applicationVersionId/submit-review` | `application.update` | `employee`、`application_admin`、`super_admin` | 版本创建者提交，状态必须为草稿 |
| POST | `/internal/applications/versions/:applicationVersionId/review` | `application.review` | `super_admin` 或既有审核权限持有人 | 应用负责人/维护人禁止自审；仅已认领该队列的审核人裁决，批准自动生效 |
| POST | `/internal/applications/versions/:applicationVersionId/claim-review` | `application.review` | `application_admin`、`super_admin`（custom role 以实际权限为准） | 只能认领可用队列项 |
| POST | `/internal/applications/versions/:applicationVersionId/release-review` | `application.review` | `application_admin`、`super_admin`（custom role 以实际权限为准） | 只能释放本人已认领队列项 |
| GET | `/internal/applications/versions/:applicationVersionId/review-queue` | `application.review` | `application_admin`、`super_admin`（custom role 以实际权限为准） | 返回当前审核范围队列 |
| POST | `/internal/applications/:applicationId/publish` | `application.publish` | `employee`（负责人）、`application_admin`、`super_admin` | 负责人（owner）或持有 `application.manage` 的管理员；审核通过、交付渠道和扫描状态合法 |
| POST | `/internal/applications/:applicationId/withdraw` | `application.publish` | `employee`（负责人）、`application_admin`、`super_admin` | 负责人（owner）或持有 `application.manage` 的管理员；应用处于可撤回状态 |
| POST | `/internal/applications/:applicationId/rollback` | `application.publish` | `employee`（负责人）、`application_admin`、`super_admin` | 目标版本已发布且回滚状态合法 |
| POST | `/internal/applications/:applicationId/archive` | `application.publish` | `employee`（负责人）、`application_admin`、`super_admin` | 负责人（owner）且无进行中的发布操作 |
| DELETE | `/internal/applications/:applicationId` | `application.update` | `employee`（负责人）、`application_admin`、`super_admin` | 仅删除 `status=draft` 的应用；级联清理子表并写入审计 |
| POST | `/internal/applications/:applicationId/transfer` | `application.update` | `employee`（负责人）、`application_admin`、`super_admin` | 负责人本人或应用管理员可移交；目标员工必须在职；写入审计 |
| GET | `/internal/applications/:applicationId/assets/:assetId/content` | `application.read` | `employee`（负责人/维护人）、`application_admin`、`super_admin` | 按资产存储键流式返回，用于图标与截图预览 |
| GET | `/internal/applications/:applicationId` | `application.read` | `employee`、`application_admin`、`super_admin` | 普通员工仅负责人/维护者；管理员可按管理范围读取 |
| GET | `/internal/applications/:applicationId/versions` | `application.read` | `employee`、`application_admin`、`super_admin` | 同应用详情的资源范围 |
| GET | `/internal/applications/:applicationId/deliveries` | `application.read` | `employee`、`application_admin`、`super_admin` | 同应用详情的资源范围 |
| GET | `/internal/applications/:applicationId/reviews` | `application.read` | `employee`、`application_admin`、`super_admin` | 同应用详情的资源范围；匿名字段按权限投影 |
| GET | `/internal/applications/:applicationId/published-version` | `application.read` | `employee`、`application_admin`、`super_admin` | 同应用详情的资源范围 |
| GET | `/internal/creator/applications` | `creator.read` | `employee`、`application_admin`、`super_admin` | 只列当前 actor 负责人或维护者的应用 |
| GET | `/internal/creator/applications/:applicationId/summary` | `creator.read` | `employee`、`application_admin`、`super_admin` | 当前 actor 必须是负责人或维护者 |
| POST | `/internal/applications/:applicationId/interactions/like` | `interaction.interact` | 所有在职员工及其专业角色 | 应用必须对 actor 可见；幂等切换 |
| POST | `/internal/applications/:applicationId/interactions/rating` | `interaction.interact` | 所有在职员工及其专业角色 | 应用必须对 actor 可见；评分范围合法 |
| POST | `/internal/applications/:applicationId/interactions/comments` | `interaction.interact` | 所有在职员工及其专业角色 | 根评论任意用户可发；回复一层仅限他人根评论（自回复/嵌套被拒）；负责人/维护者回复标记官方 |
| POST | `/internal/applications/:applicationId/interactions/comments/:commentId/reports` | `interaction.interact` | 所有在职员工及其专业角色 | 只能举报可见评论 |
| POST | `/internal/applications/:applicationId/interactions/reports/:reportId/resolve` | `interaction.moderate` | `risk_operator`、`super_admin`（custom role 以实际权限为准） | 只能处理未关闭举报并记录审计 |
| GET | `/internal/applications/:applicationId/interactions/comments/:commentId/anonymous-author` | `interaction.anonymous_audit` | `super_admin`（custom role 以实际权限为准） | 每次查询写入审计事件 |

### AI Hub Portal

Portal 保留 `/internal/portal` URL 和响应模型；其中 `resourceType=app` 的写入统一委托 `ApplicationService`，因此下表的资源条件与应用 API 完全一致。`skill`、`plugin`、`mcp` 继续使用 Portal 自有生命周期和 `portal.*` 事件。

Portal 公开读端点使用**可选认证**（`@OptionalAuth()`）：无凭据时以匿名身份放行，只能看到 `published` 资源且个性化字段（`isFavorited`、`hasVoted`）恒为 `false`；携带有效会话时与已登录行为一致；携带无效会话返回 `401`。匿名响应带分级 `Cache-Control`（列表/详情 `public, max-age=300`，docs/评论/apps-hunt `no-cache`）并统一 `Vary: Cookie`；已登录响应为 `private, no-cache`。

| Method | Path | Guard 权限 | 可用系统角色 | 资源条件 |
|---|---|---|---|---|
| GET | `/internal/portal/home`、`/internal/portal/apps`、`/internal/portal/apps/:ownerEmployeeId/:slug` | OptionalAuth（匿名可读） | 所有已登录角色 + 匿名访客 | 匿名仅见 `published`；登录后非发布 app 列表仅可按本人负责人筛选或持有 `application.review`；详情还允许负责人、维护人/维护人列表成员或 `application.review`；收藏与 AI Hub 点赞是独立概念 |
| GET | `/internal/portal/skills`、`/plugins`、`/mcps` 及详情、`/departments`(+详情)、`/skill-packages`(+详情)、`/apps-hunt`、`/docs/:pageKey`、`/:resourceType/:resourceId/comments` | OptionalAuth（匿名可读） | 所有已登录角色 + 匿名访客 | 匿名仅见 `published` 资源；非发布状态仍需本人或 `application.review` |
| GET | `/internal/portal/dashboard`、`/dashboard/stars`、`/dashboard/comments` | Authenticated | 所有已登录角色 | 个人收藏、评论与发布概览，仅返回本人数据 |
| POST | `/internal/portal/dashboard/publish` | `application.create` | `employee`、`application_admin`、`demand_operator`、`super_admin` | `app` 调用 `createApplication`；携带完整 `applicationDraft` 或兼容完整 `metadata` 时再调用 `saveDraft` |
| PUT | `/internal/portal/dashboard/publish/:resourceType/:resourceId` | `application.update` | `employee`（负责人）、`application_admin`、`super_admin` | `app` 必须提供完整草稿；`withdrawn` 可编辑，`archived` 不可编辑；不接受任意 JSON 草稿 |
| POST | `/internal/portal/dashboard/publish/:resourceType/:resourceId/versions` | `application.update` | `employee`（负责人）、`application_admin`、`super_admin` | `app` 只更新草稿中的 `version/changelog`，不会提前创建 `application_versions` 或切换版本指针 |
| POST | `/internal/portal/dashboard/publish/:resourceType/:resourceId/submit` | `application.update` | `employee`（负责人）、`application_admin`、`super_admin` | `app` 调用 `submitDraft`，原子创建版本快照、交付配置、审核队列与标准 `application.*` 事件 |
| POST | `/internal/portal/dashboard/publish/:resourceType/:resourceId/approve`、`/request-changes` | `application.review` | `application_admin`、`super_admin` | `app` 只认领当前有效队列；禁止自审，已被他人认领时拒绝；可选 `comment`，空请求体使用 Portal 默认意见 |
| POST | `/internal/portal/dashboard/publish/:resourceType/:resourceId/publish` | `application.publish` | `employee`（负责人）、`application_admin`、`super_admin` | `app` 负责人或持有 `application.manage` 的管理员可操作；已发布时幂等成功；仅遗留 `approved` 数据经标准 `publish` 处理，仍受交付门禁限制 |
| POST | `/internal/portal/dashboard/publish/:resourceType/:resourceId/withdraw` | `application.publish` | `employee`（负责人）、`application_admin`、`super_admin` | `app` 负责人或持有 `application.manage` 的管理员可操作并调用标准 `withdraw`；可选 `reason`，空请求体记录固定 Portal 来源说明 |
| POST | `/internal/portal/:resourceType/:resourceId/favorite`、`/comments` | `interaction.interact` | 所有具备互动权限的已登录角色 | 仅已发布资源可收藏或评论；app 收藏写 Portal 收藏表，不影响 AI Hub 点赞 |

### Demand、Notification 和 Analytics

| Method | Path | Guard 权限 | 可用系统角色 | 资源条件 |
|---|---|---|---|---|
| POST | `/internal/demands` | `demand.create` | 所有基础角色及专业角色 | requester 固定为当前 actor |
| PATCH | `/internal/demands/:demandId` | `demand.update` | `employee`、`demand_operator`、`super_admin` | 通过 Guard 后仍需 requester 身份；草稿/驳回状态和版本合法 |
| POST | `/internal/demands/:demandId/submit-review` | `demand.submit` | `employee`、`demand_operator`、`super_admin` | requester 操作且状态合法 |
| POST | `/internal/demands/:demandId/review` | `demand.review` | `demand_operator`、`demand_reviewer`、`super_admin` | 审核决策、状态转移和审计合法 |
| POST | `/internal/demands/:demandId/claim` | `demand.claim` | `employee`、`super_admin` 或既有权限持有人 | 旧直接认领接口；状态、负责人和 expectedVersion 校验；新方案提交/确认/释放见需求基线 |
| POST | `/internal/demands/:demandId/collaborators` | `demand.collaborate` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需需求负责人；协作角色和版本合法 |
| GET | `/internal/demands/:demandId/collaborators` | `demand.read` | 所有基础角色及专业角色 | 受众、协作者和负责人范围过滤 |
| POST | `/internal/demands/:demandId/priority` | `demand.prioritize` | `demand_operator`、`super_admin` | 优先级值和状态合法 |
| POST | `/internal/demands/:demandId/status` | `demand.progress` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需负责人/运营权限；状态机只能前进到合法状态 |
| POST | `/internal/demands/:demandId/progress` | `demand.progress` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需负责人/运营权限；操作者需属于需求协作范围 |
| GET | `/internal/demands/:demandId/progress` | `demand.read` | 所有基础角色及专业角色 | 受众和协作范围过滤 |
| POST | `/internal/demands/:demandId/pilots` | `demand.progress` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需负责人/运营权限；需求状态允许试点 |
| PATCH | `/internal/demands/:demandId/pilots/:pilotId` | `demand.progress` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需负责人/运营权限；试点属于目标需求且状态合法 |
| POST | `/internal/demands/:demandId/merge` | `demand.merge` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需负责人/运营权限；源需求、目标需求和状态均可合并 |
| POST | `/internal/demands/:demandId/applications` | `demand.associate_application` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需负责人/运营权限；应用与需求可见且关联关系唯一 |
| POST | `/internal/demands/:demandId/applications/from-demand` | `demand.associate_application` | `demand_operator`、`super_admin`（custom role 以实际权限为准） | 通过 Guard 后仍需负责人/运营权限；从需求创建应用时负责人固定为 actor |
| GET | `/internal/demands/:demandId/applications` | `demand.read` | 所有基础角色及专业角色 | 受众和协作范围过滤 |
| GET | `/internal/demands` | `demand.read` | 所有基础角色及专业角色 | 列表按受众、状态、部门和分页过滤 |
| GET | `/internal/demands/:demandId` | `demand.read` | 所有基础角色及专业角色 | 受众不匹配不泄露需求存在性 |
| POST | `/internal/demands/:demandId/like` | `demand.interact` | 所有基础角色及专业角色 | 需求必须对 actor 可见 |
| GET | `/internal/demands/:demandId/comments` | `demand.read` | 所有基础角色及专业角色 | 只返回可见评论和匿名投影 |
| POST | `/internal/demands/:demandId/comments` | `demand.interact` | 所有基础角色及专业角色 | 需求必须对 actor 可见 |
| POST | `/internal/demands/:demandId/reports` | `demand.interact` | 所有基础角色及专业角色 | 只能举报可见评论或需求 |
| POST | `/internal/demands/:demandId/reports/:reportId/resolve` | `demand.moderate` | `demand_operator`、`super_admin` | 举报属于目标需求且未关闭 |
| GET | `/internal/demands/:demandId/comments/:commentId/anonymous-author` | `demand.anonymous_audit` | `demand_operator`、`super_admin` | 每次查询写入匿名审计事件 |
| GET | `/internal/notifications` | `notification.read` | 所有基础角色及专业角色 | 仅当前 actor 的通知 |
| POST | `/internal/notifications/:notificationId/read` | `notification.read` | 所有基础角色及专业角色 | 通知必须属于当前 actor |
| POST | `/internal/notifications/retry` | `notification.deliver` | `super_admin`（custom role 以实际权限为准） | 仅失败通知且受重试次数限制 |
| GET | `/internal/analytics/dashboards/:dashboardKey` | 任一分析分段读取权限，服务内继续校验目标权限 | 对应 `analytics_<segment>_reader`、既有分析权限持有人、`super_admin` | `demand_value` 复用 `analytics.innovation.read`；普通 employee 负责人仍被 HTTP Guard 拒绝，服务负责人分支不能绕过 Guard（GAP-07）；聚合按授权范围过滤 |
| POST | `/internal/analytics/exports` | `analytics.export` + 任一分析读取权限，服务内继续校验目标权限 | `analytics_exporter`、`analytics_operator`、`super_admin` | 导出范围不能超过 actor 可见数据；在请求内返回脱敏后的 rows |
| POST | `/internal/analytics/exports/:exportId/download` | `analytics.export` | `analytics_exporter`、`analytics_operator`、`super_admin` | 任务必须存在；跨创建者操作额外需要 `analytics.export.manage`；只登记下载审计并返回 downloaded/exportId，文件数据由创建接口返回 |
| POST | `/internal/analytics/assistant` | `analytics.assistant.use` | `analytics_assistant_user`、`analytics_operator`、`super_admin` | 助手查询只能使用 actor 有权读取的指标和范围 |

## 迁移和回归约束

- 迁移把旧的 `marketplace.read` 映射为 `catalog.read`，把 `identity.manage`/`identity.read` 展开为规范身份权限，把旧的 `analytics.read` 展开为全部分析分段读取权限，并把分析指标中的 `analytics:<segment>:read` 映射为 `analytics.<segment>.read`；未知 custom permission 原样保留但不会自动获得新接口访问权。
- 系统角色权限由数据库 registry 维护，当前 demo 账号仅使用 `employee`、`super_admin`；既有专业角色的 fixture/验收报告保留原批次含义。重复 seed 必须幂等，不能为验收绕过当前分发规则。
- local employee 与 DingTalk sync 新建员工同样幂等分配 `employee` 基础角色；员工状态仍必须为 `active` 才能建立会话。
- 每个受保护 controller method 必须有显式权限元数据；全局 Guard 拒绝无元数据的受保护接口。服务层继续校验资源归属、受众、状态机和审计条件。
- `401` 表示没有有效会话，`403` 表示权限拒绝；目录受限对象及部分资源读按 `404` 隐藏存在性，以当前服务边界为准。前端刷新期间不得因为 actor 尚未恢复而显示全量菜单。
