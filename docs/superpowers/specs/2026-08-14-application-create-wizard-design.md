# 用户创建应用 —— 分层分步表单与后端优化设计

- 日期：2026-08-14
- 上游规格：`2026-07-31-ai-application-sharing-platform-design.md`（§5.4 应用发布、§9.4 发布向导）
- 目标动作：**用户创建应用**（草稿 → 自动校验 → 提交审核）
- 交付形态：前端「分层分步表单」+ 后端「接口与参数优化、提交校验加强、统一上传、存储与索引校验」+ 前后端字段整合确认

---

## 1. 现状盘点（基于代码库事实）

| 能力 | 现状 | 结论 |
|---|---|---|
| 应用基础信息 | `applications`（name/summary/owner/maintainer/department/status） | 已有，但 `summary` 为纯文本、`maintainer` 为单值 |
| 版本 | `application_versions`（version/changelog/artifact/sha256/signature/scan_status） | 已有 |
| 交付配置 | `application_deliveries`（channel/entry_url/enabled/configuration jsonb） | 已有 |
| 受众 | `application_audiences`（all/department/employee + include_children） | 已有 |
| 分类/标签 | `application_catalog_metadata.category_id` + `catalog_tags` + `application_tag_links` | 已有 |
| 资产 | `application_assets`（icon/screenshot/attachment，带 sort_order） | 已有，但**无内容上传端点**（`createAsset` 只收 `storageKey`，前端无从上传图片本体） |
| 安装包上传 | `application_artifact_uploads`（会话/raw body PUT/complete/扫描） | 已有，但仅面向 artifact |
| AI 风险 | `application_catalog_metadata.risk_description text`（单字段） | **未结构化**，无法承载 6 项 radio |
| 内容字段 | 操作手册 / 使用示例 / 常见问题 | **完全缺失** |
| 版本快照/校验 | `application_version_snapshots` + `application_validation_checks` | 已有，可复用为「自动校验报告」落点 |
| 提交校验 | `submitForReview` 仅校验 `scan_status=passed` + 状态转移 | **未校验字段完整性**（缺名称/截图数量/风险声明/受众/交付均可提交） |
| 前端分步表单 | 仅 `creator/` 列表页，无发布向导 | **完全缺失** |

> 结论：骨架（应用、版本、交付、受众、资产、上传会话）已就位，缺的是「富文本内容字段」「结构化风险声明」「多维护人」「图标自动生成」「资产内容上传」「提交完整性校验」与「前端分步表单」。

---

## 2. 字段覆盖确认（直接回应"是否涵盖"）

以下 15 项为用户给定字段清单，逐项标注覆盖状态。

| # | 字段 | 现有落点 | 状态 | 处理 |
|---|---|---|---|---|
| 1 | 应用名称 | `applications.name` | ✅ 已覆盖 | 保留；提交校验补必填+长度(≤160) |
| 2 | 归属部门 | `applications.department_id` | ✅ 已覆盖 | 保留；默认取主部门 |
| 3 | 责任人 | `applications.owner_employee_id` | ✅ 已覆盖 | 默认当前用户，治理操作可移交 |
| 4 | 维护人（多名） | `applications.maintainer_employee_id`（单值） | ⚠️ 部分 | 新增 `application_maintainers` 表承载多值 |
| 5 | 分类 | `application_catalog_metadata.category_id` | ✅ 已覆盖 | 保留；单层主分类 |
| 6 | 标签（多个） | `application_tag_links` | ✅ 已覆盖 | 保留；上限建议 ≤8 |
| 7 | 应用图标（自动/上传） | `application_assets.asset_type='icon'` | ⚠️ 部分 | 新增图标模式字段 + 自动生成逻辑 |
| 8 | 应用截图（1–6） | `application_assets.asset_type='screenshot'` | ⚠️ 部分 | 补齐 1–6 数量校验 |
| 9 | 简介（富文本） | `applications.summary`（纯文本） | ⚠️ 部分 | 升级为受限富文本 + 服务端清洗 |
| 10 | 操作手册（富文本或附件） | 无 | ❌ 缺失 | 新增 content 字段（html 或 asset 二选一） |
| 11 | 使用示例（富文本或附件） | 无 | ❌ 缺失 | 同上 |
| 12 | 常见问题（选填） | 无 | ❌ 缺失 | 新增 FAQ 结构化字段 |
| 13 | 受众规则 | `application_audiences` | ✅ 已覆盖 | 保留；提交校验补至少一条 |
| 14 | AI 风险（6 项 radio） | `risk_description`（单文本） | ❌ 未结构化 | 新增结构化风险声明（见 §3） |
| 15 | 交付配置 | `application_deliveries` + `application_delivery_assets` | ✅ 已覆盖 | 保留；按 application_type 决定必填渠道 |

**补充字段**（规格 §5.4 有、用户清单未列，建议一并纳入）：可选横向宣传封面（`cover`）、版本号与变更说明（`version`/`changelog`）。

---

## 3. AI 风险声明结构化设计

用户描述为「选项组（radio 单选）」。6 项中 **1/2/3/5 是「是/否」二选**，**4 是模型/供应商**（枚举+可选补充），**6 是免责声明**（文本）。因此数据模型按「二选 + 文本」混合设计，前端 1/2/3/5 用 `Radio.Group`，4 用 `Select`（多选模型）+ 文本，6 用 `TextArea`。

```ts
// packages/contracts/src/application.ts
export interface AiRiskDeclaration {
  handlesSensitiveData: boolean;        // 1. 是否处理员工个人信息/企业敏感数据
  sendsDataExternally: boolean;         // 2. 是否发送至外部/第三方模型供应商
  retainsConversations: boolean;        // 3. 是否保存输入/文件/对话
  retentionPeriod?: string;             //    若保存，保留周期（选填说明）
  modelProviders: string[];             // 4. 使用的模型 / AI 提供方（枚举 + 自定义）
  providerNote?: string;                //    补充说明
  affectsHighRiskDecisions: boolean;    // 5. 是否影响人事/财务/法务等高风险决策
  inputRestrictionDisclaimer: string;   // 6. 用户输入限制与免责声明
}
```

落库：新建 `application_version_risk_declarations`（以 `application_version_id` 为主键，与「不可变版本内容」语义一致），显式列存储，避免塞大 JSON（符合规格 §10.1）。`risk_description` 保留为「兼容/摘要」字段，由 6 项拼装生成，供搜索与列表快速展示。

---

## 4. 前端分层分步表单设计

### 4.1 分层架构

```
pages/creator/ApplicationCreateWizardPage   ← 页面：路由、初始化、组装
  └─ shared/forms/FormWizard                ← 通用分步容器（组件化复用核心）
       ├─ StepContext / useWizardForm        ← 步骤状态、草稿、跨步校验编排
       ├─ StepRenderer                       ← 按 steps 配置渲染当前步
       └─ WizardFooter                       ← 上一步/下一步/存草稿/提交
  └─ modules/publishing/                     ← 业务模块（各 step 表单）
       ├─ BasicInfoStep                       ← 名称/部门/责任人/维护人/分类/标签/图标/截图
       ├─ ContentStep                         ← 简介/操作手册/使用示例/常见问题（富文本）
       ├─ DeliveryStep                        ← 应用类型 + 交付配置
       ├─ AudienceStep                        ← 受众规则
       ├─ RiskStep                            ← AI 风险声明（6 项）
       └─ ReviewSubmitStep                    ← 预览 + 自动校验 + 提交
```

设计要点：
- **`FormWizard` 是通用组件**，不含业务字段；业务方只提供 `steps` 配置数组（`{ key, title, schema, component }`）。未来「创新需求」「认领方案」等向导可复用同一套分步/草稿/回显机制。
- 每步 `schema` 用 **Zod** 定义，`react-hook-form` + `@hookform/resolvers/zod` 做运行时校验；步骤间字段拆分，避免单个超大表单。
- 跨步校验：`下一步` 仅校验当前步，`提交` 走全量 `superRefine`（含截图 1–6、风险声明完整、受众非空、交付渠道完整）。

### 4.2 草稿保存与自动回显

- 草稿粒度：**应用级草稿**。首次进入新建 `application`（状态 `draft`）拿 `applicationId`，后续各步 `PUT /internal/applications/:id/draft` 全量/增量保存。
- 保存策略：**自动防抖保存**（失焦 2s + 切换步骤 + 显式「存草稿」按钮）三路触发；`onSubmit` 标记 `dirty`，返回草稿时 `form.reset(loaded)`。
- 回显：`GET /internal/applications/:id/draft` 返回一份**扁平 draft payload**（含各步字段 + 已上传 asset 引用），前端按 step key 拆解后 `reset` 到对应表单。
- 图标自动模式在回显时即时计算：`backgroundColor = hash(applicationId) % palette`，`text = name.trim()[0]`。

### 4.3 富文本填写与展示

- **编辑器选型**：推荐 **TipTap**（headless、React 19 兼容、可严格白名单节点），备选 **wangEditor**（中文生态友好）。二者均需配合服务端清洗。
- **受限富文本白名单**（对应规格 §11.3）：仅允许 `p/br/strong/em/ul/ol/li/h1-h4/blockquote/code/pre/a(内网相对链接)`，**禁止** `img/script/iframe/style/外部图片/任意 HTML`。
- 服务端清洗：NestJS 侧用白名单 HTML sanitizer（`sanitize-html`，DOMPurify 同源规则）清洗后再落库；前端展示组件 `RichTextView` 只渲染清洗后的安全 HTML。
- 附件型内容（操作手册/使用示例）与富文本**二选一**：提交时二者不能同时为空（Zod `union` + 服务端双校验）。

### 4.4 接口对接（client 层新增）

沿用 `shared/api/client.ts` 的 `apiFetch`/`apiUpload`，在 `modules/publishing/publishing.client.ts` 新增：

```ts
createApplicationDraft()                       // POST /internal/applications  { name:"", summary:"" } 拿 applicationId
saveApplicationDraft(id, draft)                // PUT  /internal/applications/:id/draft
getApplicationDraft(id)                        // GET  /internal/applications/:id/draft
initUpload(id, { kind, fileName, mimeType, sizeBytes })  // 统一上传会话（见 §5.3）
uploadContent(id, uploadId, blob, onProgress)  // PUT  content（raw body）
completeUpload(id, uploadId)                   // POST complete（校验+落 final key+扫描）
submitApplication(id, applicationVersionId)    // POST submit（提交审核，走完整性校验）
```

---

## 5. 后端优化设计

### 5.1 接口与参数优化

| 现状 | 优化 |
|---|---|
| `CreateApplicationRequestDto` 仅 name/summary/maintainer/department | 扩展为承载**草稿完整字段**的 `SaveApplicationDraftRequestDto`（分步字段扁平化） |
| 无草稿读写接口 | 新增 `PUT /:id/draft`（幂等全量保存）与 `GET /:id/draft`（回显） |
| 资产无内容上传端点 | 并入统一上传接口（见 §5.3） |
| `risk_description` 单字段 | 由结构化 `AiRiskDeclaration` 替代写入 |
| 维护人单值 | `CreateApplicationRequestDto.maintainerEmployeeIds: string[]` |

参数统一约定：所有提交字段集中到 `SaveApplicationDraftRequestDto`，以 `nullable` 表达「未填写」，提交时由服务端做完整性校验而非前端臆断。

### 5.2 提交校验加强

`submitForReview` 在现有 `scan_status` + 状态转移之上，新增**提交完整性门禁**（不满足即 `400`，错误码稳定）：

1. 名称非空且 ≤160、简介非空；
2. 分类/归属部门/责任人均已填；
3. 截图数量 ∈ [1,6]（`asset_type='screenshot'` 计数）；
4. 风险声明 6 项完整（1/2/3/5 已选、6 非空）；
5. 受众至少一条规则；
6. 按 `application_type` 校验交付渠道完整性（Web 必须有内网地址且通过白名单；桌面/移动/小程序须有已通过扫描的交付资产）；
7. 图标二选一（自动 或 已上传 icon 资产）；
8. 富文本内容已通过服务端清洗（存储前强制 sanitize）。

校验结果落 `application_validation_checks`（复用现有表），前端 `ReviewSubmitStep` 消费同一报告，避免前后端两套规则。

### 5.3 按类型区分的统一上传接口

现状是 `artifact-uploads`（安装包）与 `assets`（无上传端点）两套割裂。优化为**单一会话式上传入口，按 `kind` 区分校验策略**：

```
POST /internal/applications/:id/uploads          { kind, fileName, mimeType, sizeBytes }
PUT  /internal/applications/:id/uploads/:uploadId/content   (raw body)
POST /internal/applications/:id/uploads/:uploadId/complete
GET  /internal/applications/:id/uploads/:uploadId
```

`kind` 与校验策略对照：

| kind | 大小上限 | 扩展名/魔数 | 附加校验 |
|---|---|---|---|
| `icon` | 5MB | png/jpg/jpeg/webp/svg* | 图片重编码去元数据；建议 1:1 |
| `screenshot` | 10MB/张 | 同上 | 计数上限 6 |
| `cover` | 5MB | 同上 | 横向建议比例 |
| `attachment` | 50MB | pdf/zip/docx…白名单 | 隔离扫描后关联 |
| `qr` | 5MB | png/svg* | **必须可解析**且匹配目标格式 |
| `artifact` | 2GB | exe/msi/dmg/pkg/apk/zip | 签名校验、分片续传 |

> `svg` 属高风险格式（可内嵌脚本），按决策**支持**：落库前由服务端**强制清洗**（移除 `script`、事件处理器、`foreignObject`、`<use>` 外部引用等危险节点），清洗后保留。其余图片统一重编码去元数据。
统一后复用现有 `storage.pipeline`（`verifyStoredArtifact`/`scanStoredAsset`）做哈希、魔数与隔离扫描。

### 5.4 存储与数据库索引校验

**存储侧**（复用 `assertApplicationStorageKey` 思路，补全）：
- 对象键强制 `applications/{id}/…` 前缀，拒绝 `..`、`\`、绝对路径与越界引用；
- 上传前校验 `sizeBytes` 与声明一致（`UPLOAD_SIZE_MISMATCH`）、`complete` 前必须已有 `sha256`；
- 图片统一重编码去 EXIF；文件名不进入磁盘路径与响应头。

**数据库侧**（新 migration，建议 `0025_application_create_wizard`）：
- `application_maintainers(application_id, employee_id)` 复合主键 + `employee_id` 索引；
- `application_version_content(application_version_id PK, summary_html, manual_html, manual_asset_id, examples_html, examples_asset_id, faq jsonb)`；
- `application_version_risk_declarations(application_version_id PK, …6 列)`；
- `application_catalog_metadata` 增 `icon_mode('auto'|'upload')`、`icon_background_color`、`icon_text`、`icon_asset_id`；
- 索引补齐：`application_assets(application_id, asset_type)` 已存在；新增 `application_maintainers_employee_idx`、`application_version_content_manual_asset_idx`；
- 约束补齐：`asset_type` 增加 `cover`、`qr`；`application_versions` 提交前置 `scan_status` 一致性；截图数量由应用层计数（DB 不易做跨行 COUNT 约束，走提交门禁）。

---

## 6. 落地清单（文件级，已实施）

> 实际实施采用 **config-driven 分步容器**（`FormWizard` 内置表单与分步校验），业务步集中在 `steps.tsx` 而非独立文件，比初版清单更内聚。

**前端（已实施并 build 通过）**
- `apps/web/src/shared/forms/FormWizard.tsx` —— 通用 config-driven 分步容器（内置 useForm/FormProvider，`fields` 局部校验 + `render` 渲染）
- `apps/web/src/modules/publishing/steps.tsx` —— 6 步集中装配（基本信息/图标截图/内容富文本/交付/受众/风险/预览提交）+ `createWizardSteps`
- `apps/web/src/modules/publishing/schema.ts` —— Zod schema + `applicationDraftDefaults`
- `apps/web/src/modules/publishing/publishing.client.ts` —— 草稿读写 + 统一上传（`/uploads` 端点，complete 自动创建 asset）
- `apps/web/src/modules/publishing/index.ts` —— 公共出口
- `apps/web/src/shared/ui/RichTextEditor.tsx` / `RichTextView.tsx` —— TipTap v3 封装 + 安全渲染
- `apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx` —— 页面（default export）+ 路由注册（`ROUTES.creatorCreate`）

**后端（已实施并 typecheck + 测试通过）**
- `packages/contracts/src/application.ts` / `index.ts` —— 补 `AiRiskDeclaration`、`UploadKind`、`ApplicationDraft`、`ApplicationDraftRecord` 等类型
- `packages/database/src/schema.ts` / `migrations/0025_application_draft.ts` / `migrations/0026_unified_upload.ts` / `migrate.ts` —— `application_drafts` 表 + 上传会话 `kind` 列 + `asset_type` 扩展 `cover/qr`
- `packages/server/src/application/application.types.ts` / `application.repository.ts` —— `upsertDraft`/`findDraft` + `kind` 字段
- `packages/server/src/application/application.service.ts` —— `saveDraft`/`getDraft` + `validateDraftCompleteness` 提交门禁
- `packages/server/src/application/content-security.ts` —— 受限富文本/SVG 拒绝式白名单校验
- `packages/server/src/application/upload-policy.ts` —— kind 校验策略（大小/扩展名/MIME/魔数）
- `packages/server/src/application/unified-upload.controller.ts` —— 统一上传会话（`POST/PUT/complete/GET /:id/uploads`，complete 按 kind 自动创建 asset）
- `packages/server/src/application/application.dto.ts` / `application.controller.ts` —— `SaveApplicationDraftRequestDto` + `PUT/GET /:id/draft` 路由
- `packages/server/src/catalog/catalog.types.ts` / `repository.ts` / `service.ts` / `dto.ts` / `controller.ts` —— 新增 `GET /internal/catalog/categories`、`GET /internal/catalog/tags`（分类/标签数据源）
- 前端 `ApplicationCreateWizardPage` —— 用 TanStack Query 接入部门/员工（复用 `useIdentity`）+ 分类/标签（`listCategories`/`listTags`），注入 `createWizardSteps` options
- `packages/database/src/migrations/0027_version_artifact_nullable.ts` —— `application_versions` 制品字段可空（Web/小程序无安装包）
- `packages/server/src/application/application.service.ts` —— `submitDraft` 用例（完整性校验 → 规范化落库 → 创建无安装包版本 → 进入审核队列），`DraftValidationError` 携带校验问题
- `packages/server/src/application/application.repository.ts` —— `updateApplicationContent`/`upsertCatalogMetadata`/`replaceTagLinks`/`replaceAudiences`/`snapshotVersionContent`
- `packages/server/src/application/application.controller.ts` —— `POST /:id/submit-draft` 路由（校验失败返回 400 + issues）
- 前端 `publishing.client.ts` `submitApplicationDraft` + 页面「提交审核」接入
- `packages/server/src/application/application.service.ts` `publish` + `repository.getApplicationType` —— 发布按 `application_type` 校验所需交付渠道（web_app→web、desktop_app→desktop 等，未知类型回退四类齐全）

**尚未接入（下一增量）**
- 图片重编码去元数据 / 二维码内容解析 —— 当前统一上传已做魔数 + 扩展名 + SVG 清洗，重编码与二维码解码待接入专用库

---

## 7. 已确认决策（2026-08-14 定稿）

1. **富文本编辑器**：采用 **TipTap**（React 19 兼容，headless，可严格白名单节点）。
2. **AI 风险第 4 项**：采用**预置枚举**（多选 + 可补充）：`deepseek` / `qwen`（通义千问）/ `wenxin`（文心一言）/ `hunyuan`（混元）/ `local`（本地部署）/ `other`（其他）。第 6 项免责声明采用**简易固定模板 + 可编辑**：预置一段默认模板文本，用户在预填基础上可修改。
3. **图标 SVG**：**支持**，但 SVG 属可内嵌脚本的高风险格式，落库前**强制服务端清洗**（移除 `script`、事件处理器、`foreignObject`、外部引用等），不直接放行原始内容。
4. **草稿保存粒度**：**整表单一份 draft**（`PUT /:id/draft` 全量幂等保存，`GET /:id/draft` 整体回显）。
