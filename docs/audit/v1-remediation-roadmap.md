# AI Hub Platform V1 收尾实施路径（全栈）

> 基准日期：2026-08-12
> 输入基线：`docs/audit/v1-flow-gap-matrix.md`（缺口矩阵）+ `docs/audit/v1-local-runnable-audit.md`（本地台账）
> 目标：**关闭两条核心业务链（发布链/消费链）+ 组织与安全管理 + 验证视觉收口**，V1 达到"本地真实可运行、前端真实接线、证据可验收"。
> 纪律：0001–0017 migration 已发布不可改，只新增 0018+；删除生产路径 mock；测试文件/preview/demo seed 中的 mock 属允许范围；不发明审计未提及的大重构。

---

## 一、现状评估（审计结论）

- **工程门禁已绿**：format / lint / typecheck / boundaries / build 全通过；Web 全量测试 17 文件 85 用例通过。
- **后端状态机与核心表基本存在**：登录、应用状态机（create→version→review→publish）、交互（点赞/评分/评论列表）、行为记录、admin-list、Analytics、Assistant、Security audit 读取均已实现。
- **两条业务链均不闭环**：
  - 发布链：真实文件上传、前端版本创建、审核认领/审批、交付保存、发布动作**未完成接线**。
  - 消费链：下载/使用按钮 disabled、普通用户无评论入口、独立反馈实体不存在、评分半星契约冲突、评论分页 bug。
- **组织与安全缺口**：员工/部门/角色无 CRUD、钉钉同步无管理接口、安全审计只有单表读取、前端大量 mock（`ROLES_MOCK_DATA`、`DEPARTMENTS_MOCK_DATA`、sync mock、KPI 硬编码 1286/98.6%、`PLACEHOLDER_TABS`、`SECURITY_AUDIT_DEMO_ROWS`）。
- **运行验证未做**：migration/seed/API/worker/浏览器流程因 Docker 曾不可用而未执行；UI 视觉验收 0/21；真实端到端 0/11。

## 二、实施原则（方法论）

1. **先基建、后业务、再验证**：数据库迁移与存储适配器先行，两条业务链随后，组织与安全第三，验证视觉最后收口。
2. **后端契约先行**：每个批次的接口/DTO/Repository 先落定并有单测，再写前端 client/hook/页面。
3. **逐批验收**：每批结束跑工程门禁 + 领域测试 + curl 证据，不留技术债到下一批。
4. **证据驱动**：只把有代码/测试/截图/curl 证据的能力标记为完成；外部依赖（DingTalk 凭据、ClamAV、S3）显式降级不阻塞。

## 三、批次总览

| 批次 | 名称 | 完成标准（本批末尾全部满足） |
| --- | --- | --- |
| 批次0 | 基建与数据库迁移 | migration 0018-0020 可执行；DiskObjectStorage 接线；ArtifactPipeline 在生产注入；工程门禁全绿 |
| 批次1 | 发布链闭环（P0） | 上传→创建版本→配置交付→提交审核→认领→审核→发布 全链路前端真实接线；应用管理页语义修复 |
| 批次2 | 消费链闭环（P0） | delivery resolve 接口 + 市场 CTA 真实接线；普通评论/回复权限改造 + 分页 + 评分整数化；应用反馈 CRUD |
| 批次3 | 组织与安全（P1） | 员工/部门/角色 CRUD + 钉钉同步管理接口 + 统一安全审计 read model + 前端 mock 全删除 |
| 批次4 | 验证与视觉收口（P1） | Docker 空库/重复 migration、seed 幂等、API/worker health、5 角色双链 e2e、21 张截图、告警清零 |
| 批次5 | 终验与交付 | `pnpm verify` + 全量门禁 + 证据归档，审计台账更新为 DONE |

依赖：批次1/2/3 均依赖批次0；批次4 依赖批次1-3；批次5 依赖批次4。

---

## 四、批次0：基建与数据库迁移

### 4.1 数据库迁移（`packages/database`）

**新增 `src/migrations/0018_organization_sync_fields.ts`**
- `departments` 加 `status`、`manager_employee_id`、`external_id`、`last_synced_at`（+ manager/status/source 索引）
- `roles` 加 `status`、`created_by_employee_id`、`created_at`、`updated_at`
- 新增 `identity_sync_run_items`（sync_run_id、对象类型/ID、状态、成功/失败计数、错误码、起止时间、retry_of_item_id）
- 新增 `identity_sync_config`（单行；敏感凭据只存 secret reference）

**新增 `src/migrations/0019_artifact_uploads.ts`**
- 新增 `application_artifact_uploads`（upload_id、application_id、上传者、object_key、文件名、MIME、大小、sha256、签名、part 数、上传/扫描状态、错误码、过期/完成时间）
- `application_assets` 加 `sha256`、`scan_status`、`uploaded_by_employee_id`、`object_etag`、`updated_at`
- 新增 `application_delivery_assets`（delivery_id、platform、asset_id、version、sort_order）
- `application_versions.artifact_key` 唯一索引；统一 `artifact_signature` 契约（DB/Service 保留非空 + Web 类型改非空，与 `CreateVersionRequestDto` 一致）

**新增 `src/migrations/0020_security_audit_feedback.ts`**
- 新增 append-only `security_audit_events`（trace_id、module、action、actor、subject、result、risk、ip、user_agent、details、created_at；时间/模块/actor/trace 索引）
- 新增 `security_audit_export_jobs`（筛选快照、状态、结果 storage key、过期时间、创建者）
- 新增 `application_feedback`（application/version、creator、type(bug/suggestion/content_issue)、body、status、assignee、resolution、created/updated/resolved_at）
- `catalog_delivery_actions` 加 `idempotency_key`、`status`（initiated/served/failed）、`completed_at`、`failure_code`
- `application_comments` 加 `comment_kind`（user/official）

**配套**：`schema.ts` 同步全部新表/新字段；`demo-data/`、`demo-seed.ts` 补默认值保持幂等；新增 `*.integration.test.ts`（Testcontainers）为新表/字段加约束与 round-trip 断言。

### 4.2 Disk 对象存储适配器（`packages/server` + `apps/api`）

- **新增 `src/application/storage.disk.ts`**：`DiskObjectStorage implements ObjectStoragePort`（put/get/copy/delete）；存储根目录注入（`config.storageDirectory`）；key 防路径穿越（拒绝 `..`/绝对路径/空串）；put 用临时文件 + rename 原子写；copy 用流复制。
- **新增 `src/application/storage.noop.ts`**：`NoopMalwareScanner`（恒 clean）与 `NoopSignatureVerifier`（恒 true）；注释明确 ClamAV 为外部演进项。
- **改 `application.module.ts` / `application.tokens.ts`**：新增存储装配选项与 token，组合 `new ArtifactPipeline(diskStorage, { scan, verify })`。
- **改 `packages/config`**：新增 `storageDirectory`、`artifactMaxSizeBytes` 配置项。
- **改 `apps/api/src/main.ts` / `api.module.ts`**：构造 `DiskObjectStorage` + Noop 组件，将 `ArtifactPipeline` 传入 `ApiModule.register`（参数由 undefined 改为可选透传）。
- **新增 `storage.disk.test.ts`**：put/get/copy/delete、路径穿越拒绝、原子写。

### 4.3 统一契约（`packages/contracts`）

- **改 `src/identity.ts`**：`PERMISSIONS` 新增 `IDENTITY_EMPLOYEE_MANAGE`、`IDENTITY_DEPARTMENT_MANAGE`、`IDENTITY_ROLE_MANAGE`、`IDENTITY_SYNC_MANAGE`、`IDENTITY_SYNC_RUN`、`SECURITY_AUDIT_EXPORT`。
- 复用既有 `PaginatedResult<T>`（interaction.ts）；**只在新增接口统一使用，不改既有接口**。
- 不引入全局 `ApiErrorResponse`/`PageResult<T>` 大重构（非阻塞项，本次不做）。

### 批次0 验收门禁
```
pnpm format:check && pnpm lint && pnpm typecheck && pnpm boundaries && pnpm build
pnpm --filter @ai-hub/database test   # 新 migration 集成测试（Testcontainers）
```

---

## 五、批次1：发布链闭环（P0）

### 5.1 Artifact 上传 API（后端 `packages/server/src/application`）

**新增 `artifact-upload.controller.ts`**（挂 ApplicationModule）：
- `POST :applicationId/artifact-uploads` → 创建上传会话，返回 `{ uploadId, objectKey, expiresAt }`
- `PUT :applicationId/artifact-uploads/:uploadId/content` → raw body 单请求上传（V1 简单方案），写临时 object key，服务端算 sha256
- `POST :applicationId/artifact-uploads/:uploadId/complete` → 调 `ArtifactPipeline.completeUpload`（chunkIndex=0, expectedChunks=1，签名必填/空串走 Noop verify）；成功写 final key + `scan_status=passed`；失败返回 reason 并清理
- `GET :applicationId/artifact-uploads/:uploadId` → 上传/扫描状态查询

**⚠️ 大文件实现提示**：`ArtifactPipeline.chunks` 是内存 Map，2GB 安装包不可经内存承载。`PUT content` 用**流式写临时文件**（`req.pipe(fs.createWriteStream)` + 边写边算 sha256），complete 时按 `putChunk(0)` 语义交给 pipeline 校验后清理；或 controller 层单 chunk 直写 `storage.put` + pipeline 只做 digest/scan/verify，避免 `Buffer.concat` 内存峰值。Nest body limit 需上调（约 2.5GB），dev proxy 加大缓冲。

**配套**：
- `application.repository.ts` / `application.types.ts`：`application_artifact_uploads` CRUD（createUpload / markUploadStatus / findUpload）
- `application.dto.ts`：`ArtifactUploadInitDto` / `ArtifactUploadStatusDto` / `CompleteArtifactUploadDto`
- **新增 Asset 管理**：`GET/POST :applicationId/assets`、`DELETE :applicationId/assets/:assetId`，写 `application_assets` + `application_delivery_assets`
- `application.service.test.ts`：覆盖上传→complete→createVersion 链路
- `createVersion` 复用现有接口（scanStatus 必须 passed 才可建版本，已有 service 校验）

### 5.2 前端 client + hooks（`apps/web/src/modules/application`）

- `application.client.ts` 新增：`createVersion` / `configureDelivery` / `claimReview` / `releaseReview` / `reviewApplicationVersion` / `publishApplication` / `getReviewQueue` / `createArtifactUpload` / `uploadArtifactContent`（XHR 带进度）/ `completeArtifactUpload` / `getArtifactUploadStatus` / `listAssets` / `uploadAsset` / `deleteAsset`
- 注意 `apiFetch` 默认 JSON header，raw body 上传需覆盖
- `useApplication.ts`：对应 mutations + queries，onSuccess 统一 invalidate `["applications"]`/`["creator"]`/`["catalog"]`
- **新增 `modules/application/artifact-upload.ts`**：XHR 上传封装（progress + 取消）

### 5.3 版本页真实化（`pages/applications/ApplicationVersionsPage.tsx`）

- 删除 `fallbackVersions`（空数据只显示 Empty）
- 新增"上传新版本"抽屉/表单：选文件 → 建上传会话 → 上传（进度）→ complete（显示 sha256/扫描状态）→ 填版本号 + changelog → createVersion
- 移除"开始对比"假按钮；版本对比区读真实 `application_version_snapshots` 或明确标注

### 5.4 审核页真实化（`pages/applications/ApplicationReviewPage.tsx`）

- 删除 `fallbackReviews` 与静态 `validationChecks`
- 读 `getReviewQueue` 真实 SLA/领取人；validation checks 从 `application_validation_checks` 读取
- 领取/释放/通过/驳回 → 真实 mutation；驳回原因必填
- 审核历史用已有 `listReviews`；通过后显示"去发布"入口

### 5.5 交付页真实化（`pages/applications/ApplicationDeliveryPage.tsx`）

- 四渠道表单 → `configureDelivery` 保存到 `PUT /deliveries/{channel}`（web 填 entryUrl；desktop/mobile 选真实 asset；mini_program 填 entryUrl/配置）
- 移除静态 URL/回调/安装包/二维码/最近记录；安装包走 `listAssets` + `uploadAsset`
- "提交审核"由 owner 在版本页触发 submit-review（页面内提示正确入口）

### 5.6 应用管理页语义修复（`pages/applications/ApplicationsPage.tsx`）

- 创建应用：`window.prompt` → 受控表单（Modal/Drawer）
- review 动作：**不再调用 submitApplicationReview**，改跳 `/applications/:id/review` 审核工作台
- edit 动作：跳 `/creator/:applicationId`（现错跳 `/applications/:id`）
- delete/republish：`throw new Error` → 按状态机给合理操作（不支持则明确禁用 + tooltip）
- approved 状态行加"发布"按钮 → `publishApplication`

### 批次1 验收门禁
```
pnpm --filter @ai-hub/server test && pnpm --filter @ai-hub/web test
pnpm typecheck && pnpm boundaries
```
curl 证据：上传→创建版本→配置交付→submit→claim→review approve→publish 全链路 200 序列。

---

## 六、批次2：消费链闭环（P0）

### 6.1 Delivery resolve 接口（后端 `packages/server/src/catalog`）

- `catalog.controller.ts` 新增 `POST :applicationId/deliveries/:channel/resolve`：
  - 受众校验复用 `getDetail`（findVisible 已含过滤，不可见返回 404/403）
  - 返回 discriminated union：web → `{kind:"web_redirect", url}`；desktop/mobile → `{kind:"download", url: 下载端点}`；mini_program → `{kind:"qr", payload}`
  - 写 `catalog_delivery_actions`：`status=initiated`、`idempotency_key = action:{sessionId}:{appId}:{channel}:{versionId}` 防重
- 下载端点返回真实文件流（从 storage.get）
- `catalog.service.test.ts` 覆盖 resolve 受众矩阵

### 6.2 市场 CTA 接线（前端 `modules/marketplace` + `pages/marketplace`）

- `marketplace.client.ts` 新增 `resolveDelivery` / `downloadAsset`
- `MarketplaceDetailHeader.tsx`：移除"立即使用"disabled，按 `deliveryChannels` 渲染渠道按钮（打开/下载/扫码），点击调 resolve
- 市场卡片/列表下载按钮接 resolve；文案不宣称浏览器已落盘

### 6.3 评论权限改造 + 分页 + 评分（后端 interaction + 前端）

- **后端** `interaction.service.ts`：`reply` 拆为 `createComment`（INTERACTION_INTERACT 均可建根评论）+ `replyComment`（仅 owner/maintainer 回复一级，保留两级约束，`comment_kind=official`）；写 `comment_kind`（user/official）
- **后端** `interaction.controller.ts`：POST comments 语义更新；DTO 增加 `commentKind`
- **前端** `interaction.client.ts` + `useInteraction.ts`：新增 `createComment` / `replyComment`
- **前端** `MarketplaceDetailReviews.tsx`：加评论提交表单；**修复分页 bug**——`MarketplaceDetailPage` 不再传死 `page=1`，页码状态提升并传入 `useRatings/useComments` query
- **前端** `MarketplaceDetailHeader.tsx`：`Rate` 删除 `allowHalf`，`onRate` 传整数
- 测试：普通用户根评论/官方回复/两级约束；前端分页驱动 query

### 6.4 应用反馈（后端新建 + 前端）

- **后端** 新建 `packages/server/src/feedback/`（controller/service/repository/types/dto）：
  - `POST /internal/applications/:id/interactions/feedback`（创建）
  - `GET .../feedback`（列表，创建者可见处理状态）
  - `PATCH .../feedback/:feedbackId`（仅 owner/maintainer 更新 status/resolution）
  - 写 `application_feedback`；创建时发 outbox（`feedback.created`）
- **前端**：feedback client + hooks；市场详情 Reviews tab 增加"应用反馈"区块（bug/suggestion/content_issue 表单 + 我的反馈状态列表）

### 批次2 验收门禁
```
pnpm --filter @ai-hub/server test && pnpm --filter @ai-hub/web test
pnpm typecheck && pnpm boundaries
```
curl 证据：普通用户 POST 根评论成功 / owner 回复成功 / 非 owner 回复 403；resolve 返回合法 URL；评分 2.5 返回 400。

---

## 七、批次3：组织与安全管理（P1）

### 7.1 员工/部门/角色 CRUD（后端 identity）

- 员工：`GET /identity/employees`（分页筛选）、`POST`（含部门/角色）、`PATCH /employees/:id`、`POST /employees/:id/status`（启停用）、`POST /employees/:id/roles`（角色分配）、`POST /employees/import`（批量导入）
- 部门：`GET /identity/departments`（聚合 read model：memberCount 来自 department_memberships、applicationCount 来自 applications、lastSyncedAt）、`POST`、`PATCH /departments/:id`、启停用、删除/迁移校验
- 角色：`GET/POST /identity/roles`、`PATCH/DELETE /roles/:roleCode`（系统角色禁删）、权限模板读取
- 最近登录：`user_sessions.created_at` 聚合（不重复存储）
- 改 `identity.controller.ts` / `identity.service.ts` / `identity.repository.ts` / `identity.dto.ts` / `identity.types.ts` + 测试

### 7.2 钉钉同步管理接口（后端 identity）

- `GET /identity/sync/overview`（最近 run、成功率、失败数）
- `GET /identity/sync/runs`（分页）、`GET /identity/sync/runs/:id`（含 run items）
- `POST /identity/sync/runs`（手动触发，复用已有 `syncDingTalkDirectory`）
- `POST /identity/sync/runs/:id/retry`（重试失败 item）
- `GET/PUT /identity/sync/config`（凭据只存 reference）
- **降级策略**：无 DingTalk 凭据时 overview/config 返回"未配置"；manual run 返回 400 `DINGTALK_CREDENTIALS_NOT_CONFIGURED`，前端降级文案而非假成功

### 7.3 统一安全审计（后端 `system/security` + 写入点）

- **新增** `audit.controller.ts` / `audit.service.ts` / `audit.repository.ts`：
  - `GET /internal/security/overview`（事件总数、高风险数、今日登录失败数）
  - `GET /internal/security/audit-logs`（升级现有实现：分页 + module/action/actor/risk/时间范围筛选 + trace 查询，返回 PaginatedResult）
  - `POST /internal/security/audit-exports`、`GET /internal/security/audit-exports/:id`（异步导出作业）
- **写入点**（各模块调统一 `AuditService.record()`，最小侵入）：
  - identity：login success/fail、logout、session revoke、员工/角色变更、sync run
  - application：发布链状态机
  - interaction：举报处理、评论隐藏/恢复
  - catalog：delivery resolve/action
  - analytics：导出作业
  - worker：outbox 消费失败
- **保留**既有业务审计表为业务审计，安全审计是跨模块统一视图，二者不替代

### 7.4 前端 mock 全删除（organization / security）

- `roles/constants.ts`（ROLES_MOCK_DATA）→ 接 `GET /identity/roles`
- `departments/constants.ts` + `DepartmentStats.tsx` → 接部门 read model；删除 `memberTotal: 1286`、`syncRate: "98.6%"`
- `sync/constants.ts` + `useSyncRows.ts` → 接 sync overview/runs/config；删除 200ms 假延时
- `OrganizationPage.tsx`：KPI 由后端 read model 聚合
- `SecurityPage.tsx`：审计日志接分页筛选；导出接真接口；删除 `PLACEHOLDER_TABS`
- `security.client.ts`：删除 demo 生成逻辑

### 批次3 验收门禁
```
pnpm --filter @ai-hub/server test && pnpm --filter @ai-hub/web test
pnpm typecheck && pnpm boundaries && pnpm lint
```
证据：org 页面无 mock 关键词残留（grep 断言）；5 角色 CRUD 权限矩阵。

---

## 八、批次4：验证与视觉收口（P1）

1. **Docker 运行验证**：启动 Docker Desktop Linux engine；空库 migration（0018-0020）成功；重复执行幂等；seed 幂等（连续两次计数一致）；`GET /health`（API）+ worker health + metrics。
2. **双流程 e2e + 权限矩阵**：5 个 demo 角色跑发布链与消费链两条浏览器业务链；401/403/禁止自审矩阵；Playwright/浏览器截图 + curl 序列。
3. **21 张设计图视觉验收**：`packages/ui/src/*.png`（普通页视口 1672×941，应用详情与创作者中心 2730×1536）；并置比较（2px 内）、键盘可达性、响应式（768×1024 / 390×844）；截图归档 `.verify/`。
4. **告警清理**：jsdom `getComputedStyle` → mock matchMedia/ResizeObserver；Ant Design deprecation → 升级 API；React Router future flag → 补配置；NaN style → 修复数值渲染。目标 `pnpm --filter @ai-hub/web test` stderr 清零。

### 批次4 验收门禁
```
pnpm migrate && pnpm seed:demo-data && pnpm seed:demo-accounts
pnpm test && pnpm build
```
证据：health 200 curl、双链截图、21 图差异报告、stderr 空。

---

## 九、批次5：终验与交付

- `pnpm verify`（scripts/verify.mjs 全量）
- 全量门禁一次通过：`format:check / lint / typecheck / boundaries / build / test`
- 更新两份审计台账：P0 两链、P1 组织安全、验证收口标记 DONE；上传分片/DingTalk 凭据/ClamAV/S3 单列为外部演进项
- 交付：本文档 + 证据目录（`.verify/` 截图、curl 脚本、迁移日志）

---

## 十、关键设计决策

| 编号 | 决策 | 说明 |
| --- | --- | --- |
| D1 | Disk 存储适配器先行 | `DiskObjectStorage` 实现 ObjectStoragePort（临时文件+rename 原子写、key 防穿越）；Noop scanner/verifier 占位；ArtifactPipeline 验证流程不变；S3/Garage 为后续演进 |
| D2 | 上传不用分片 | 三阶段：建会话 → 单请求 raw body 上传（流式落盘+算 sha256）→ complete（expectedChunks=1）；分片语义保留供未来 S3 multipart 复用 |
| D3 | Delivery resolve 设计 | `POST /internal/catalog/{id}/deliveries/{channel}/resolve`，受众校验隐含在 getDetail；返回 discriminated union；写行为记录（idempotency_key 防重、status=initiated）；下载走平台内流式端点 |
| D4 | 评论权限改造 | `reply` 拆 `createComment`（根评论，全员）+ `replyComment`（owner/maintainer 回复一级，官方）；保留两级约束；`comment_kind` 标记官方回复 |
| D5 | 统一安全审计写入点 | append-only `security_audit_events` + 统一 `AuditService.record()`；六个模块增量接入；保留既有业务审计表 |
| D6 | PageResult 只在新增接口统一 | identity 列表/security audit/feedback 返回 `PaginatedResult<T>`；不改既有接口 |

## 十一、依赖与风险

| 风险 | 缓解 |
| --- | --- |
| review queue 与 5 角色权限（自审 403） | 批次1 完成即 e2e 验证 claim→review 403/自审矩阵；ApplicationsPage review 入口语义修正先行 |
| DingTalk 外部凭据缺失 | controller 显式 `DINGTALK_CREDENTIALS_NOT_CONFIGURED`；管理接口不依赖凭据可全量验收 |
| `artifact_signature` 契约冲突（DB 非空 vs Web nullable） | 统一非空；上传 complete 后签名必填，Noop verify 恒 true |
| 发布顺序（先配置交付再提交审核） | publish 前置校验四渠道 enabled 已有 service 逻辑；前端按顺序引导 |
| migration 与既有 seed 兼容 | 0018-0020 全部向前兼容；seed 幂等批次4 真实验证 |
| 评论分页 bug | hook 已支持 page 参数，仅页面传参死值，修复点唯一 |
| 上传大小限制（2GB 单请求） | Nest body limit + proxy 缓冲；批次0 配置 + 批次4 实测 |
| 审计写入侵入面 | repository 内一行 `auditService.record()` 封装，逐模块增量接入 |

## 十二、涉及文件总览

- **packages/database**：新增 migrations 0018/0019/0020；改 `schema.ts`、`demo-seed.ts`、`demo-data/**`、`*.integration.test.ts`
- **packages/server**：新增 `application/storage.disk.ts`、`storage.noop.ts`、`storage.disk.test.ts`、`application/artifact-upload.controller.ts`、`feedback/**`、`system/security/audit.*`；改 application/catalog/interaction/identity 各模块
- **apps/api**：改 `main.ts`（注入 DiskObjectStorage + ArtifactPipeline）、`api.module.ts`
- **apps/web/src**：改 `modules/{application,marketplace,interaction,security,auth}/**`；新增 `modules/application/artifact-upload.ts`；重写 `pages/applications/*` 四页；改 `pages/marketplace/detail/*`、`pages/organization/**`、`pages/security/**`
- **packages/contracts**：改 `src/identity.ts`（PERMISSIONS +6）
- **docs/audit**：更新两份审计台账（批次5）

---

*本文档为 V1 收尾实施路径，按批次推进，每批结束后更新台账并附证据。*
