# AI Hub Platform V1 静态数据、接口、数据库与双流程闭环矩阵

更新日期：2026-08-12

## 总结判定

- 用户登录的前后端代码链已经存在，但由于 Docker Desktop/Testcontainers 不可用，尚未取得真实 PostgreSQL 会话联调证据。
- “登录 → 上传应用 → 审核应用 → 发布市场”当前不闭环。后端状态机和核心表基本存在，但真实文件上传、前端版本创建、审核认领/审批、交付保存和发布动作没有完成接线。
- “登录 → 下载/使用 → 评论 → 点赞 → 评分 → 反馈”当前不闭环。市场发现、点赞和评分有真实接口；下载/使用按钮被禁用，普通用户评论没有入口，独立反馈实体和接口不存在。
- UI 视觉验收为 0/21：本轮没有可运行 Docker 环境，因此没有当前审计运行产生并验收的真实页面截图。
- 真实本地端到端领域链为 0/11：现有单元测试和 Web 测试不能替代 Compose + PostgreSQL + API + worker + 浏览器证据。

## DONE

### 工程门禁

- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm boundaries`、`pnpm build` 已通过。
- Web 全量测试 17 个文件、85 个测试通过。
- seed 脚本已隔离仓库 `.env` 对缺少 `DATABASE_URL` 用例的污染。
- 数据库 fixture 的 lint、类型和单元测试问题已修复。

### 已有真实代码链

- 密码登录：登录 options/challenge、加密登录、session 持久化、actor 恢复、logout 和权限路由均已有实现。
- 应用状态机：创建应用、创建版本、提交审核、认领/释放审核、审批、发布、撤回、回滚和归档均已有 Service/Repository 逻辑。
- 应用安全约束：禁止自审、审核认领、artifact 校验、交付渠道完整性、状态机和审计/Outbox 已在 Service 层实现。
- 市场目录：应用列表、详情、版本、风险说明和受众过滤已有 API。
- 应用互动：点赞、整数评分、评分列表、评论列表、官方回复、举报和审核隐藏/恢复已有 API 与持久化。
- 交付行为：`web_redirect`、`package_download`、`qr_display` 的行为记录 API 和 `catalog_delivery_actions` 表已经存在。
- 应用管理列表、Analytics platform、Assistant、Security audit 已完成真实前后端读取接线。

## UNDO

### 前端未完成

- 版本管理页没有创建版本或上传 artifact 的真实表单；空数据时仍回退到静态版本记录。
- 审核工作台的领取、释放、通过、驳回全部仍是“只读预览”提示，没有调用现有后端接口；审核历史为空时显示静态审核记录。
- 交付配置页只有读取接口；保存草稿、提交审核、桌面/移动安装包和二维码均为静态展示。
- 发布动作没有从管理工作台调用现有发布接口。
- 市场“立即使用”和附件“下载”按钮被禁用，没有调用已有交付行为接口，也没有获取可用下载地址。
- 评论页只能读取评分/评论，普通员工没有发表评论入口；前端评论分页只改变局部页码，没有驱动查询页码。
- 评分组件允许半星，但后端和数据库只接受 1–5 的整数，存在明确契约冲突。
- 没有独立的应用反馈表单、接口或状态跟踪。
- 组织管理的角色、完整部门、同步状态和大量操作按钮仍为 mock 或无 handler。
- Security 的安全配置、会话管理、安全扫描页签仍是占位，审计导出仍为提示。

### 后端未完成

- 没有对外暴露真实 artifact 分片上传、完成上传、扫描状态查询和签名结果接口。`storage.pipeline.ts` 只是内存管道及单元测试实现。
- 组织管理没有用户、部门、角色的 V1 CRUD 接口，也没有角色列表接口。
- 钉钉同步只有 Service/Repository 能力，没有管理端 overview、任务列表、手动执行、失败重试和配置接口。
- Security audit 目前只查询 `identity_audit_events`，不是跨应用、互动、分析和 worker 的统一系统审计；也没有分页、复杂筛选和导出。
- 目录交付行为接口只记录动作，不返回经过受众校验的跳转地址、短期下载 URL 或二维码 payload。
- 应用评论 POST 当前只允许所有者/维护者进行官方回复，不能创建普通用户根评论。
- 没有独立的应用反馈领域接口。
- 缺少统一 `ApiErrorResponse` 和统一 `PageResult<T>` 的完整落地。

### 数据库/运行验证未完成

- PostgreSQL migration、重复 migration、demo seed 幂等和约束测试因 Docker/Testcontainers runtime 不可用而未执行。
- API、worker、Outbox 和浏览器的真实本地联调未执行。
- 21 张设计图没有当前运行截图、并置差异和状态矩阵证据。

## TODO（按优先级）

### P0：关闭应用发布链

1. 实现 artifact 上传 API 和对象存储适配器；上传完成后再允许创建版本。
2. 前端新增 `createVersion`、`configureDelivery`、`claimReview`、`releaseReview`、`reviewApplicationVersion` 和 `publishApplication` client/hook。
3. 版本页改为真实上传/创建版本；移除 `fallbackVersions`。
4. 审核页读取 review queue、validation checks 和 snapshots，并把领取、释放、通过、驳回接到真实 API；移除 `fallbackReviews` 和静态校验结果。
5. 交付页把四类渠道表单保存到 `PUT /internal/applications/{applicationId}/deliveries/{channel}`，安装包选择真实 asset，移除静态 URL、文件、二维码和操作历史。
6. 审批通过且交付完整后，从工作台调用发布接口；发布成功后在 `/internal/catalog` 可查询。

### P0：关闭市场消费链

1. 新增 delivery resolve 接口，完成受众校验并返回 Web 跳转、短期下载 URL 或二维码 payload；同时写入行为记录。
2. “立即使用”和下载按钮接真实接口，不再 disabled；只把“开始下载/完成服务端响应”标为可验证，不宣称浏览器已保存文件。
3. 将现有评论 POST 改为：普通员工可创建根评论；所有者/维护者可回复一级评论；保留最大两级约束。
4. 增加评论提交表单和 mutation；让分页页码进入 `useRatings/useComments` 查询参数。
5. V1 评分统一为整数星，前端删除 `allowHalf`；若产品坚持半星，再把 API 与数据库改为 0.5 步进。
6. 明确“反馈”定义。V1 建议增加 bug/suggestion/content_issue 三类反馈、处理状态和创建者可见的处理结果。

### P1：关闭组织与安全管理

1. 增加员工、部门、角色列表与 CRUD、角色分配、启停用和批量导入接口。
2. 增加同步 overview、run list、run detail、manual run、retry、config 接口。
3. 增加统一安全审计 read model、分页筛选和异步导出接口。
4. 删除组织和 Security 核心路径中的 mock、假延时、无 handler 按钮与伪成功提示。

### P1：验证与视觉收口

1. 启动 Docker Desktop Linux engine。
2. 执行空库 migration、重复 migration、seed 两次、数据计数和 API/worker health。
3. 使用 5 个 demo 角色跑两条浏览器业务链和 401/403/禁止自审矩阵。
4. 按原始视口完成 21 张设计图截图、并置比较和键盘/响应式检查。
5. 清理 jsdom `getComputedStyle`、Ant Design deprecation、React Router future flag 和 NaN style 告警。

## 前端静态数据与占位清单

| 页面/模块 | 当前静态内容 | 影响 | 处理方式 |
| --- | --- | --- | --- |
| 组织管理/角色 | `ROLES_MOCK_DATA` | 角色列表、成员数、创建人、状态均不可信 | 接角色列表与 CRUD API，成员数由 `employee_roles` 聚合 |
| 组织管理/部门 | `DEPARTMENTS_MOCK_DATA` | 负责人、成员数、关联应用、同步时间、状态均为设计数据 | 接部门管理 read model，计数由 membership/application 聚合 |
| 组织管理/同步 | tasks/health/alerts/logs/config/stats 全部 mock，并有 200ms 假延时 | 所有同步按钮和统计均不代表真实运行 | 接 sync overview/run/config API |
| 组织管理/用户 | 角色和最近登录时间按数组索引生成 | 用户详情不可信 | API 返回角色；最近登录由 `user_sessions` 聚合 |
| 组织管理/KPI | `memberTotal=1286`、`syncRate=98.6%` | KPI 虚假 | 后端 read model 返回实时聚合 |
| 应用版本管理 | `fallbackVersions`、静态 artifact 元数据 | 空库也显示多个版本 | 删除 fallback，增加上传/创建版本流程 |
| 审核工作台 | `fallbackReviews`、静态 SLA/领取人/校验项；按钮只弹提示 | 审核流程完全未接线 | 接 review queue、snapshots、validation checks 与审核 mutation |
| 交付配置 | 默认 URL、回调地址、安装包、二维码、上传限制、最近记录；保存/提交是假操作 | 无法配置或发布真实交付 | 接 delivery/asset/upload API |
| 市场详情 | 负责人/维护人、问题描述、关键特性、评分人数由其他字段推导；附件固定 | 详情信息可能误导用户 | 扩展 Catalog detail contract，读取真实人员、内容和 assets |
| 市场详情 CTA | “立即使用”、附件下载、收藏 disabled | 消费主路径中断 | 接 delivery resolve/action；收藏不在 V1 时明确移除或禁用说明 |
| 市场评论 | 只有列表，无普通用户评论表单 | 不能完成评论流程 | 接现有/改造后的评论 POST |
| AI 助手 | capabilities、示例问题和 recommendedApps 为静态数据 | 问答是真实 API，但推荐内容不是真实目录结果 | 推荐应用改为后端返回 application IDs，再批量查目录 |
| Security | 3 个占位页签、导出提示；文件仍保留未使用 demo rows | 安全管理不完整 | 实现接口后删除 demo 常量和占位 tabs |
| 应用管理筛选/KPI | 部门、应用类型选项硬编码；KPI 拉前 200 条列表前端聚合 | 数据超过 200 条会失真 | 增加 metadata 与 KPI summary API |
| 创作者中心 | 审核中撤回、草稿删除明确禁用 | 对应后端状态机未支持 | 若不属 V1 保持禁用并说明；否则补状态机/API |

测试文件、preview 目录和 demo seed 中的 mock 属于允许范围，不计为生产运行时静态数据。

## 后端接口矩阵

### 已存在，但必须完成前端接线

| 能力 | 现有接口 | 当前问题 |
| --- | --- | --- |
| 创建版本 | `POST /internal/applications/{applicationId}/versions` | 前端无 client/form，且没有真实上传结果可提交 |
| 配置交付 | `PUT /internal/applications/{applicationId}/deliveries/{channel}` | 交付页只读并展示静态数据 |
| 提交审核 | `POST /internal/applications/versions/{versionId}/submit-review` | 管理列表存在错误语义接线；版本页/交付页未形成正确入口 |
| 认领/释放审核 | `POST .../claim-review`、`POST .../release-review` | 审核页仍是假按钮 |
| 审核决定 | `POST .../review` | 审核页仍是假按钮 |
| 发布 | `POST /internal/applications/{applicationId}/publish` | 前端无 client/hook/CTA |
| 记录下载/跳转/二维码 | `POST /internal/catalog/{applicationId}/actions` | 前端无 client，接口不返回实际交付目标 |
| 点赞/评分 | `POST .../interactions/like`、`POST .../rating` | 已接线；评分半星契约冲突待修 |
| 评论列表 | `GET .../interactions/comments` | 已接线；前端分页没有驱动 query |
| 官方回复/举报/审核 | `POST .../comments`、reports/hide/restore | 普通用户无法创建根评论，前端缺提交/举报入口 |

### 必须新增或扩展

| 接口族 | 建议接口 |
| --- | --- |
| Artifact 上传 | `POST /internal/applications/{id}/artifact-uploads`、`PUT .../{uploadId}/parts/{partNumber}` 或 presigned part、`POST .../{uploadId}/complete`、`GET .../{uploadId}` |
| Asset 管理 | `GET/POST /internal/applications/{id}/assets`、`DELETE /internal/applications/{id}/assets/{assetId}` |
| 交付解析 | `POST /internal/catalog/{id}/deliveries/{channel}/resolve`，返回受众校验后的 redirect URL、短期 download URL 或 QR payload |
| 应用反馈 | `POST /internal/applications/{id}/interactions/feedback`、`GET .../feedback`、`PATCH .../feedback/{feedbackId}` |
| 员工管理 | 支持分页筛选的 `GET /internal/identity/employees`，以及 `POST/PATCH`、状态变更、角色分配、批量导入 |
| 部门管理 | 支持聚合字段的 `GET /internal/identity/departments`，以及 `POST/PATCH`、启停用、删除/迁移校验 |
| 角色管理 | `GET/POST /internal/identity/roles`、`PATCH/DELETE /roles/{roleCode}`、权限模板读取 |
| 同步管理 | `GET /internal/identity/sync/overview`、`GET /sync/runs`、`GET /sync/runs/{id}`、`POST /sync/runs`、`POST /sync/runs/{id}/retry`、`GET/PUT /sync/config` |
| 安全审计 | `GET /internal/security/overview`、分页筛选版 `/audit-logs`、`POST /audit-exports`、`GET /audit-exports/{id}` |
| 应用管理摘要 | `GET /internal/applications/admin-kpis`、`GET /internal/applications/admin-metadata` |

## 数据库同步修改方案

不得修改已经发布的 `0001`–`0017` migration，应增加向前兼容 migration，并同步更新 `packages/database/src/schema.ts`、fixture、seed、Repository 和集成测试。

### 无需新增表即可完成

- 员工 CRUD：复用 `employees`、`department_memberships`、`employee_roles`。
- 用户最近登录：从 `user_sessions.created_at` 聚合，不需要在 `employees` 重复存储。
- 角色成员数：从 `employee_roles` 聚合。
- 部门成员数和关联应用数：从 `department_memberships`、`applications` 聚合。
- 普通用户根评论：复用 `application_comments`，修改 Service 权限规则即可。
- 点赞、整数评分、评论/回复、举报：现有表足够。
- 下载/跳转动作审计：现有 `catalog_delivery_actions` 可记录“已发起”。

### 建议 migration 0018：组织管理字段与同步任务

- `departments` 增加 `status`、`manager_employee_id`、`external_id`、`last_synced_at`；增加 manager/status/source 索引。
- `roles` 增加 `status`、`created_by_employee_id`、`created_at`、`updated_at`；系统角色禁止删除。
- 新增 `identity_sync_run_items`：`sync_run_id`、对象类型/ID、状态、处理/成功/失败计数、错误码、起止时间、`retry_of_item_id`。
- 视需要新增 `identity_sync_config` 单行配置表；敏感凭据只保存 secret reference，不保存明文。

### 建议 migration 0019：Artifact 与交付资产

- 新增 `application_artifact_uploads`：upload ID、application ID、上传者、object key、文件名、MIME、大小、SHA-256、签名、part 数、上传/扫描状态、错误码、过期/完成时间。
- `application_assets` 增加 `sha256`、`scan_status`、`uploaded_by_employee_id`、`object_etag`、`updated_at`。
- 新增 `application_delivery_assets`：delivery ID、platform、asset ID、version、sort order，解决 Windows/macOS/APK 等多资产映射。
- `application_versions.artifact_key` 增加唯一索引；统一 `artifact_signature` nullable 契约。目前数据库/Service 要求非空，而 Web 类型允许 `null`。

### 建议 migration 0020：统一审计、反馈和交付结果

- 新增 append-only `security_audit_events`，包含 trace ID、module、action、actor、subject、result、risk、IP、user agent、details、createdAt，并建立时间/模块/actor/trace 索引。
- 新增 `security_audit_export_jobs`，保存筛选快照、状态、结果 storage key、过期时间、创建者和审计信息。
- 新增 `application_feedback`：application/version、creator、type、body、status、assignee、resolution、created/updated/resolvedAt。
- `catalog_delivery_actions` 增加 `idempotency_key`、`status`、`completed_at`、`failure_code`。浏览器文件是否真正落盘不可可靠证明，状态命名应使用 initiated/served/failed，避免伪称 downloaded。
- `application_comments` 增加 `comment_kind`（user/official），避免应用负责人变化后无法准确识别历史官方回复。

## 流程闭环判定

### 流程 A：登录 → 上传应用 → 审核 → 发布市场

| 步骤 | 当前健康度 | 证据与缺口 |
| --- | --- | --- |
| 1. 登录 | 代码闭环，运行未验收 | 前端加密登录、后端 session/actor/权限和表已存在；无真实 PostgreSQL 浏览器证据 |
| 2. 创建应用 | 部分闭环 | 创建按钮真实 POST，但只是 prompt，不是设计图向导 |
| 3. 上传 artifact | 未闭环 | 没有生产上传 API；交付页安装包是假数据 |
| 4. 创建版本 | 后端完成、前端未接 | API/Service/表存在，页面没有提交入口 |
| 5. 配置交付 | 后端完成、前端未接 | PUT API 存在，页面保存是假成功 |
| 6. 提交审核 | 部分接线且存在语义错误 | 管理列表把 reviewer 的“审核”动作错误接到 submit-review；正确入口应由 owner 提交 |
| 7. 认领与审核 | 后端完成、前端未接 | 禁止自审和认领约束存在；审核页所有动作仍是假提示 |
| 8. 发布 | 后端完成、前端未接 | 发布要求 approved + 四渠道 enabled；前端没有发布操作 |
| 9. 市场可见 | 后端查询存在、运行未验收 | Catalog 只应返回 published/受众可见应用；未完成真实 DB/browser 验证 |

结论：不闭环。Service 单元测试证明状态机可从 create → version → review → publish，但不能证明用户可以通过当前前端完成这条链。

### 流程 B：登录 → 下载/使用 → 评论 → 点赞 → 评分 → 反馈

| 步骤 | 当前健康度 | 证据与缺口 |
| --- | --- | --- |
| 1. 登录 | 代码闭环，运行未验收 | 同流程 A |
| 2. 市场发现/详情 | 基本代码闭环 | 列表和详情真实 API；详情部分人员、文案和附件仍静态派生 |
| 3. 下载/立即使用 | 未闭环 | CTA disabled；行为记录 API 虽存在，但前端未调用且接口不返回实际交付地址 |
| 4. 评论 | 未闭环 | 评论列表真实；普通用户无表单，后端 POST 仅允许 owner/maintainer 官方回复 |
| 5. 点赞 | 代码闭环，运行未验收 | 前端 mutation、后端事务、审计/Outbox 和唯一主键存在 |
| 6. 评分 | 部分闭环 | 前端/后端/表已接；前端允许半星而后端只接受整数；没有评分文字输入 |
| 7. 反馈 | 未实现 | 没有应用级 feedback 表、API、前端表单和处理状态；评论举报不能替代一般反馈 |

结论：不闭环。当前只可确认市场读取、点赞和整数评分具有完整代码链，不能确认下载、普通评论和反馈。

## 证据限制

- Docker Desktop Linux engine 当前不可连接，因此不能提供本轮真实页面流程截图。
- Product Design audit 要求截图必须来自当前审计运行；旧设计图和旧截图不能冒充运行证据。
- PostgreSQL 集成测试、worker/Outbox、对象存储、ClamAV 和真实浏览器 network/console 仍需环境恢复后验证。
