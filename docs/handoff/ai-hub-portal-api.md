# AI-HUB-PORTAL 接口对接文档

| 项目 | 内容 |
| --- | --- |
| 文档版本 | `v1.3` |
| 更新日期 | `2026-08-28` |
| 服务端仓库 | `AI-HUB-PLATFORM` |
| 客户端仓库 | `AI-HUB-PORTAL` |
| API 前缀 | `/internal/portal` |
| 认证方式 | 读端点可选认证（无凭据匿名放行）；写端点必选 HttpOnly Cookie（首选）或兼容身份请求头 |
| 数据事实 | `app` 的写入、版本、审核、发布和下架统一由 `ApplicationService` 管理 |

本文档是 Portal 前端联调的接口事实来源。后端仍保留 Portal URL，应用（`resourceType=app`）的持久化和生命周期不再由 Portal 专属表直接驱动。`skill`、`plugin`、`mcp` 继续使用 Portal 自有资源生命周期。

## 1. 接入边界

- Portal 页面只调用同源 `/internal/portal/*`，不访问数据库，也不依赖 Worker 或 Outbox 的内部结构。
- 当前兼容 URL、HTTP 方法和成功响应结构保持不变。
- `app` 的创建、编辑、保存版本、提交、审核、发布、下架会同步 AI Hub 的应用读模型；两端应以同一个 `resourceId`（即 `applicationId`）作为应用身份。
- Portal 不应自行拼装或发送任意 JSON 作为应用草稿。应用更新和提交必须携带完整 `applicationDraft`；服务端仍兼容历史请求中完整的 `metadata` 草稿。
- 不要在客户端缓存或猜测 `currentVersionId`。该字段只有审核通过并激活版本后才会切换。

## 2. 认证与请求约定

**写端点（发布、收藏、评论、投票等）默认要求认证**，未认证返回 `401`。**公开读端点（列表、详情、首页、部门、技能包、内容页、评论读取）使用可选认证**：无凭据时以匿名身份放行，携带凭据时按常规校验（无效会话返回 `401`，不降级为匿名）。前端 API 客户端建议始终携带同源凭据，未登录时不携带 Cookie 即可匿名访问公开读端点：

```ts
const response = await fetch(path, {
  ...init,
  credentials: "same-origin",
  headers: {
    "content-type": "application/json",
    ...init.headers,
  },
});
```

服务端首选以下 HttpOnly Cookie：

- `aihub_eid`：当前员工身份。
- `aihub_sid`：当前会话。

为兼容旧客户端，也接受请求头 `x-employee-id` 和 `x-session-id`。生产代码不得把会话值写入 `localStorage`，也不得在日志中打印 Cookie 或身份请求头。写请求沿用现有 CSRF、`x-request-nonce` 和 `x-request-timestamp` 约定。

### 2.1 DingTalk SSO

`GET /internal/identity/login/options` 始终包含 `password`；仅在服务端注入 DingTalk SSO 服务时才额外包含 `dingtalk_sso`。客户端只有收到该 method 才展示入口。

完整流程为：客户端调用 `GET /internal/identity/login/dingtalk/start?returnTo=...`，其中 `returnTo` 必须是 Portal 的回调页，例如 `/login?dingtalk=complete&returnTo=%2Fdashboard`；服务端完成 OAuth 回调后写入短时 HttpOnly `dingtalk_handoff` cookie 并重定向至该地址；Portal 立即 `POST /internal/identity/login/dingtalk/complete` 消费 handoff、取得正式会话，再跳转安全校验后的 `returnTo`。不要把 handoff token 暴露到 URL 或 localStorage。

### 2.2 匿名访问（公开读端点）

门户公开浏览支持匿名调用，未登录用户无需携带任何凭据即可读取：

- **匿名可用端点**：`home`、四类资源（app/skill/plugin/mcp）列表与详情、`comments`（GET）、`departments`(+详情)、`skill-packages`(+详情)、`apps-hunt`（GET）、`docs/:pageKey`。
- **匿名语义**：只返回 `status=published` 的资源；`isFavorited`、`hasVoted` 恒为 `false`；owner/maintainer 特权对匿名一律不生效。
- **可选认证**：请求携带有效会话时，上述端点返回与已登录一致的个人化数据（如 `isFavorited`）；携带**无效**会话返回 `401`，不会静默降级为匿名。
- **缓存行为**：匿名列表/首页/详情响应带 `Cache-Control: public, max-age=300`；docs/评论/apps-hunt 为 `no-cache`；所有响应统一 `Vary: Cookie`，已登录响应为 `private, no-cache`。客户端不应覆盖这些响应头语义。
- **限流**：匿名读端点按 IP 限流（应用层 60s/120 次，nginx 生产另按 20r/s 边缘限流）。前端不要为公开读端点做无节制的轮询。
- 写端点（发布、收藏、评论、投票）与 `dashboard/*` 个人中心仍要求认证，未认证返回 `401`。

## 3. 通用数据结构

### 3.1 资源项与分页

资源列表和详情的服务端返回类型为 `PortalResourceItem`：

```ts
interface PortalResourceItem {
  resourceId: string;
  resourceType: "app" | "skill" | "plugin" | "mcp";
  ownerEmployeeId: string;
  ownerName: string;
  slug: string;
  name: string;
  summary: string;
  status: "draft" | "in_review" | "approved" | "published" | "withdrawn" | "archived";
  /** 仅 resourceType=app 返回；Portal 自有资源不返回该字段。 */
  currentVersionId?: string | null;
  metadata: unknown;
  favoriteCount: number;
  isFavorited: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PortalPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

应用 `metadata` 的稳定字段如下（列表仅返回轻量字段，详情返回全部字段）：

```ts
interface PortalApplicationMetadata {
  departmentId: string;
  departmentName: string;
  tags: string[];
  iconUrl?: string;
  summaryHtml?: string;
  version?: string;
  compatibility?: string[];
  deliveryTypes?: string[];
  screenshots?: string[];
  securityStatus?: "passed" | "pending" | "failed" | "unknown";
  publishedAt?: string;
  files?: Array<{ id: string; name: string; path: string; type: "file"; size: number; language?: string; downloadUrl: string }>;
}
```

详情只投影当前生效版本快照；已发布应用存在更新审核时仍展示旧版本，审核通过后才切换。首次审核且没有生效版本时展示最新审核快照，纯草稿展示 `application_drafts`。响应不会暴露 `objectKey`、`storageKey` 或其他底层存储键；`latestSecurityReport` 在没有真实报告来源时省略。
```

`Date` 字段通过 JSON 返回 ISO 8601 字符串。Portal 当前页面模型中的 `id/type/description/owner` 等字段需要在 API 适配层从 `resourceId/resourceType/summary/ownerEmployeeId/ownerName` 映射，不能改变服务端字段含义。

### 3.3 现有 Portal 页面模型的适配

建议在 `src/apis` 建立单独的 DTO 转换，不要让服务端 DTO 直接泄漏到所有页面：

| Portal 页面字段 | 服务端字段 | 说明 |
| --- | --- | --- |
| `id` | `resourceId` | 应用写入流程后续始终使用该 ID |
| `type` | `resourceType` | 值域为 `app\|skill\|plugin\|mcp` |
| `description` | `summary` | 列表和详情统一使用摘要 |
| `owner.employeeId` | `ownerEmployeeId` | 详情 URL 的 owner 参数 |
| `owner.displayName` | `ownerName` | 仅有展示名时填充 |
| `stars`（Portal 收藏语义） | `favoriteCount` | 不要解释为 AI Hub 点赞或下载量 |
| `isStarred` | `isFavorited` | 收藏按钮状态 |
| `status` | `status` | 建议页面状态类型覆盖服务端枚举，不要把 `approved` 静默改成 `published` |
| `currentVersionId` | `currentVersionId` | 仅应用存在，提交审核期间可能为 `null` 或保持旧值 |

`score`、`downloads`、`rating`、`iconUrl` 等字段不在 `PortalResourceItem` 稳定契约中。页面若需要这些信息，应先确认 `metadata` 中有明确来源或增加后端 DTO，不要用收藏数、版本号等字段猜测替代。

### 3.2 错误响应

错误使用 Problem Details 风格的 JSON，常见结构如下：

```ts
interface PortalProblem {
  code: string;
  detail?: string;
  traceId?: string;
  issues?: Array<{
    code: string;
    message: string;
    /** 稳定点路径，例如 `deliveries.0.entryUrl`。 */
    path?: string;
  }>;
}
```

前端应保留 `code`、`traceId` 和 `issues`，并按 `code` 决定提示或跳转：

| HTTP | `code` 示例 | 前端处理 |
| --- | --- | --- |
| `400` | `PORTAL_APP_DRAFT_REQUIRED` | 提示补齐完整应用表单，不重试原请求 |
| `400` | `DRAFT_VALIDATION_FAILED` | 展示 `issues` 的字段级校验信息；`path` 为服务端 dotted string |
| `400` | `PORTAL_RESOURCE_STATE_CONFLICT`、`PORTAL_VERSION_ALREADY_EXISTS` | 刷新详情后让用户重新选择操作 |
| `400` | `PORTAL_REVIEW_QUEUE_NOT_FOUND`、`REVIEW_QUEUE_CLAIM_REQUIRED` | 刷新审核队列；不要自动重复提交结论 |
| `403` | `PORTAL_PUBLISH_FORBIDDEN`、`PORTAL_REVIEW_FORBIDDEN`、`PORTAL_SELF_REVIEW_FORBIDDEN` | 显示无权限或禁止自审，不泄露额外对象信息 |
| `404` | `PORTAL_RESOURCE_NOT_FOUND`、`PORTAL_CONTENT_PAGE_NOT_FOUND` | 显示资源不存在或内容页不存在 |
| `401` | 未认证 | 跳转登录或重新建立会话 |

## 4. 读取接口

所有列出的读取接口都使用 `GET`，返回 JSON。列表默认 `sortBy=score`、`page=1`、`pageSize=20`，`pageSize` 最大为 `100`。

| 方法 | 路由 | 查询/路径参数 | 返回 |
| --- | --- | --- | --- |
| `GET` | `/internal/portal/home` | 无 | 首页聚合：`apps`、`skills`、`plugins`、`mcps`、`departments`、`skillPackages`、`updates` |
| `GET` | `/internal/portal/apps` | `query`、`ownerEmployeeId`、`status`、`sortBy=score\|latest\|name`、`page`、`pageSize` | `PortalPage<PortalResourceItem>` |
| `GET` | `/internal/portal/apps/:ownerEmployeeId/:slug` | 路径参数 | `PortalResourceItem` |
| `GET` | `/internal/portal/skills` | 同上 | `PortalPage<PortalResourceItem>` |
| `GET` | `/internal/portal/skills/:ownerEmployeeId/:slug` | 路径参数 | `PortalResourceItem` |
| `GET` | `/internal/portal/plugins` | 同上 | `PortalPage<PortalResourceItem>` |
| `GET` | `/internal/portal/plugins/:ownerEmployeeId/:slug` | 路径参数 | `PortalResourceItem` |
| `GET` | `/internal/portal/mcps` | 同上 | `PortalPage<PortalResourceItem>` |
| `GET` | `/internal/portal/mcps/:slug` | 路径参数 | `PortalResourceItem` |
| `GET` | `/internal/portal/:resourceType/:resourceId/comments` | `resourceType`、`resourceId` | `PortalCommentItem[]` |
| `GET` | `/internal/portal/dashboard` | 无 | Dashboard 概览对象 |
| `GET` | `/internal/portal/dashboard/stars` | `page`、`pageSize` | `PortalPage<PortalResourceItem>` |
| `GET` | `/internal/portal/dashboard/comments` | `view=replies\|mine`、`resourceType`、`sort=latest\|oldest`、`page`、`pageSize` | 评论分页 |
| `GET` | `/internal/portal/departments` | 无 | 部门摘要数组 |
| `GET` | `/internal/portal/departments/:departmentId` | 路径参数 | 部门详情及应用列表 |
| `GET` | `/internal/portal/skill-packages` | 无 | Skill 包摘要数组 |
| `GET` | `/internal/portal/skill-packages/:packageSlug` | 路径参数 | Skill 包详情 |
| `GET` | `/internal/portal/apps-hunt` | 无 | 应用评选活动，每条记录含 `hasVoted` |
| `GET` | `/internal/portal/docs/:pageKey` | `pageKey=tutorials\|about\|updates` | 内容页 |
| `GET` | `/internal/portal/dashboard/publish/app/:applicationId` | 应用 ID | `{ resource, applicationDraft, draftUpdatedAt }`；无草稿返回 `PORTAL_APP_DRAFT_NOT_FOUND` |

应用详情中的图标、截图和附件 URL 统一为：

`GET /internal/portal/apps/:applicationId/assets/:assetId/content`

已发布资源只能读取当前生效版本快照引用且扫描通过的资产；应用 owner 可预览尚未发布但扫描通过的上传。未授权、资产不存在或未通过扫描均返回 `404`，不暴露对象存在性。

`status` 为非 `published` 时，只有资源 owner 或具备 `application.review` 的审核人员可以查询。公开目录页面默认只查询 `status=published`。

`apps-hunt` 按“每位员工、每个周期一张有效票”计算 `hasVoted`。投票同一条目幂等；投票另一条目会在同一事务内停用旧票并激活新票，周期关闭后返回 `PORTAL_HUNT_PERIOD_NOT_ACTIVE`。数据库部分唯一索引保证并发下最多一张有效票。

Skill 包详情的 `skills[]` 条目同时返回 `ownerEmployeeId` 与 `ownerName`。前端生成 Skill 详情链接时必须使用条目自己的 owner，不得借用 Skill 包 owner，否则跨员工 Skill 可能 404。

`GET /internal/portal/docs/:pageKey` 与首页 `updates` 均返回非空 `summary`；内容页摘要来自 `portal_content_pages.summary`，不会再以空串作为正常数据。

### 4.1 收藏与评论

收藏：

```http
POST /internal/portal/app/{resourceId}/favorite
Content-Type: application/json

{"active": true}
```

返回：`{ "resourceType": "app", "resourceId": "...", "active": true }`。取消收藏时发送 `active=false`。收藏是 Portal 互动数据，不等同于 AI Hub 点赞。

评论：

```http
POST /internal/portal/app/{resourceId}/comments
Content-Type: application/json

{"body": "内容清晰，建议补充移动端说明。", "parentCommentId": null}
```

`body` 长度为 `1..4000`；仅已发布资源可评论。服务端会清洗和规范化内容，客户端不得依赖未清洗 HTML。

## 5. 应用写入接口

以下路由保留 Portal 原有 URL，但 `resourceType=app` 会委托 `ApplicationService`。成功的 POST 默认 HTTP `201`，PUT 默认 HTTP `200`。

### 5.1 创建应用草稿

```http
POST /internal/portal/dashboard/publish
Content-Type: application/json

{
  "resourceType": "app",
  "slug": "expense-assistant",
  "name": "费用助手",
  "summary": "用于费用填报和票据识别的应用。",
  "applicationDraft": { "...完整 ApplicationDraft..." }
}
```

响应为 `PortalResourceItem`。`applicationDraft` 可选：未携带时仍会创建应用壳以兼容旧调用；携带后必须是完整草稿并立即保存。旧客户端可以把完整草稿放在 `metadata`，但新的 Portal 代码应使用 `applicationDraft`。

### 5.2 更新应用草稿

```http
PUT /internal/portal/dashboard/publish/app/{applicationId}
Content-Type: application/json

{
  "slug": "expense-assistant",
  "name": "费用助手",
  "summary": "更新后的摘要。",
  "applicationDraft": { "...完整 ApplicationDraft..." }
}
```

应用更新必须提供完整 `applicationDraft`（或兼容的完整 `metadata`），不能只发送 `name`、`summary` 或任意 Portal 元数据。`withdrawn` 可以编辑；`archived` 不可编辑。成功返回最新 `PortalResourceItem`。

草稿刷新使用：

`GET /internal/portal/dashboard/publish/app/:applicationId`

该接口先执行 owner 校验，再读取标准 `ApplicationService.getDraft`。返回的 `draftUpdatedAt` 为 ISO 8601 字符串。空壳应用没有草稿时使用 `PORTAL_APP_DRAFT_NOT_FOUND`，前端应回到编辑流程补齐草稿。

### 5.2.1 应用资产上传

上传底层复用统一 Application 上传的大小、MIME、扩展名、魔数、SVG 安全校验和扫描门禁。四个 Portal 路由均支持 HttpOnly Cookie 或兼容身份请求头，响应为安全 DTO，不返回底层存储键：

```ts
interface PortalApplicationUpload {
  uploadId: string;
  kind: "icon" | "screenshot" | "attachment" | "artifact";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: string;
  scanStatus: string;
  sha256: string | null;
  errorCode: string | null;
  assetId: string | null;
}
```

```text
POST /internal/portal/dashboard/publish/app/:applicationId/uploads
PUT  /internal/portal/dashboard/publish/app/:applicationId/uploads/:uploadId/content
POST /internal/portal/dashboard/publish/app/:applicationId/uploads/:uploadId/complete
GET  /internal/portal/dashboard/publish/app/:applicationId/uploads/:uploadId
```

推荐顺序为创建会话 → PUT raw body → complete → 将返回的 `assetId` 写入草稿 → 刷新草稿回读。扫描失败、魔数/MIME/大小不符和过期会话按 `errorCode` 展示并重新创建上传，不重试已失败会话。

PUT 请求推荐使用 `Content-Type: application/octet-stream`，以便 Portal 与 AI Hub Web 共用同一客户端约定。为兼容浏览器直接发送 `File`/`Blob` 的真实 MIME（如 `image/png`），服务端也会在**上述内容上传 PUT 路由**解析 raw body；这不会放宽其他业务路由。实际允许的声明 MIME、扩展名、大小及文件魔数仍按创建上传会话时的统一策略校验。

### 5.3 `ApplicationDraft` 完整结构

前端表单提交的对象必须满足以下字段。字段值应与 `@ai-hub/contracts` 中的 `ApplicationDraft` 一致：

```ts
interface ApplicationDraft {
  name: string;
  departmentId: string;
  maintainerEmployeeIds: string[];
  categoryId: string;
  applicationType: "web_app" | "desktop_app" | "mobile_app" | "mini_program";
  tagIds: string[];
  customCategoryName?: string;
  customTagNames?: string[];
  icon: {
    mode: "auto" | "upload";
    backgroundColor: string | null;
    text: string | null;
    assetId: string | null;
  };
  screenshotAssetIds: string[];
  attachmentAssetIds?: string[];
  summaryHtml: string;
  manualHtml: string | null;
  manualAssetId: string | null;
  examplesHtml: string | null;
  examplesAssetId: string | null;
  faq: Array<{ question: string; answer: string }>;
  audience: Array<{
    audienceType: "all" | "department" | "employee";
    departmentId: string | null;
    employeeId: string | null;
    includeChildren: boolean;
  }>;
  risk: {
    handlesSensitiveData: boolean;
    sendsDataExternally: boolean;
    retainsConversations: boolean;
    retentionPeriod: string | null;
    modelProviders: string[];
    providerNote: string | null;
    affectsHighRiskDecisions: boolean;
    inputRestrictionDisclaimer: string;
  };
  deliveries: Array<{
    channel: "web" | "desktop" | "mobile" | "mini_program";
    entryUrl: string | null;
    minClientVersion: string | null;
    enabled: boolean;
    assetIds: string[];
    targets?: Array<Record<string, unknown>>;
  }>;
  version: string;
  changelog: string;
}
```

`summaryHtml`、`manualHtml`、`examplesHtml` 会在服务端进行 XSS 清洗；前端仍应在编辑器预览和提交前做基本提示，但不能用客户端清洗结果替代服务端校验。`desktop_app`、`mobile_app` 和 `mini_program` 的交付配置还会触发服务端交付门禁。

### 5.4 保存版本信息

```http
POST /internal/portal/dashboard/publish/app/{applicationId}/versions
Content-Type: application/json

{"version": "1.2.0", "changelog": "补充移动端交付说明。"}
```

响应：`{ "resourceId": "...", "resourceType": "app", "version": "1.2.0" }`。

对 `app`，此接口只把 `version/changelog` 合并回当前应用草稿，不创建 `application_versions` 正式版本。正式版本快照、审核队列和 Outbox 事件只在提交审核时原子创建。对 `skill/plugin/mcp`，该接口仍保存 Portal 自有版本记录。

### 5.5 提交审核

```http
POST /internal/portal/dashboard/publish/app/{applicationId}/submit
```

服务端重新读取完整草稿并执行标准校验。成功返回最新 `PortalResourceItem`，首次提交状态为 `in_review`，同时创建版本快照和审核队列；`currentVersionId` 首次提交仍为 `null`。

校验失败返回：

```json
{
  "code": "DRAFT_VALIDATION_FAILED",
  "detail": "草稿未通过提交校验",
  "issues": [
    {
      "code": "DRAFT_DELIVERY_WEB_ENTRY_URL_REQUIRED",
      "message": "Web 渠道需填写入口地址",
      "path": "deliveries.0.entryUrl"
    }
  ]
}
```

当前后端的 `issues` 保证 `code`、`message` 和稳定的 dotted-string `path`；前端应保留并用于字段定位。历史服务若返回 `path: string[]`，适配层可兼容转换为页面内部模型，但不得要求新后端返回数组。

缺少完整草稿时返回 `PORTAL_APP_DRAFT_REQUIRED`，前端应回到编辑页补全，而不是重试同一请求。

### 5.6 审核通过或要求修改

```http
POST /internal/portal/dashboard/publish/app/{applicationId}/approve
Content-Type: application/json

{"comment": "审核通过，交付配置完整。"}
```

```http
POST /internal/portal/dashboard/publish/app/{applicationId}/request-changes
Content-Type: application/json

{"comment": "请补充数据保留周期。"}
```

请求体可省略，旧的无请求体调用仍有效。省略时服务端使用固定默认意见：

- `approve`：`由 AI Hub Portal 审核通过`
- `request-changes`：`由 AI Hub Portal 请求修改`

审核人必须具备 `application.review`，不得审核自己负责或维护的应用。审核队列未认领时，当前审核人会先认领；已被其他审核人认领时返回 `PORTAL_REVIEW_CLAIMED_BY_OTHER`，不得强行重试。审核通过会自动发布并注册目录，返回状态 `published`；要求修改会回到提交前状态（首次发布通常为 `draft`）。

### 5.7 发布遗留 `approved` 应用

```http
POST /internal/portal/dashboard/publish/app/{applicationId}/publish
```

新审核链路在 `approve` 时自动上架，因此正常流程不需要再调用此接口。该接口仅用于兼容历史 `approved` 数据；已经是 `published` 的应用按幂等成功返回。调用者需要通过 Portal owner/维护关系或 `application.manage` 通过 Portal 权限检查，并满足标准 `application.publish`、交付门禁和版本指针约束。

### 5.8 下架应用

```http
POST /internal/portal/dashboard/publish/app/{applicationId}/withdraw
Content-Type: application/json

{"reason": "移动端交付暂时维护。"}
```

请求体可省略；缺少 `reason` 时使用固定说明 `由 AI Hub Portal 发起下架`。成功返回状态 `withdrawn` 的 `PortalResourceItem`，已生效的 `currentVersionId` 保留。调用仍受标准发布权限、owner/`application.manage` 和状态 CAS 约束。

## 6. 应用生命周期与读写一致性

```text
draft ──submit──> in_review ──approve──> published
  ▲                  │                     │
  │                  └─request-changes────┘
  │                                        │
  └──────────── withdrawn <── withdraw ────┘
                    │
                    └─编辑并重新 submit──> in_review
```

- `currentVersionId` 只指向已审核通过并激活的版本；提交审核不会提前切换它。
- 已发布应用更新审核期间仍保持目录可见，审核通过后原子切换版本指针。
- 版本、目录注册、审核记录和标准 `application.*` Outbox 事件由同一事务边界维护。
- Portal 不再产生新的 `portal.app.*` 生命周期事件；历史事件处理器暂时保留用于排空存量 Outbox。
- 前端 mutation 成功后应失效应用详情、应用列表、Dashboard 和当前用户收藏相关查询，随后重新读取服务端事实。

## 7. 权限矩阵（前端只做体验控制，服务端是最终裁决）

| 操作 | 服务端要求 |
| --- | --- |
| 读取已发布目录 | 已认证；资源可见性由 Portal 策略决定 |
| 创建应用草稿 | `application.create` |
| 编辑自己负责的应用 | owner/维护人并通过标准草稿更新权限；`archived` 不可编辑 |
| 提交审核 | 应用 owner/维护人，草稿完整且通过校验 |
| 审核/要求修改 | `application.review`；禁止自审；审核队列必须由当前审核人认领 |
| 遗留发布 | owner 或 `application.manage`，并满足 `application.publish` 与交付门禁 |
| 下架 | owner 或 `application.manage`，并满足 `application.publish` |
| 收藏/评论 | `interaction.interact`；评论对象必须为已发布资源 |

## 8. Portal 前端落地建议

1. 继续通过 `src/apis/*.ts` 调用接口；页面不要直接调用 `fetch` 或 `portalOpenApi` 之外的内部实现。
2. `src/apis/common.ts` 的 `apiFetch` 应保持 `credentials: "same-origin"`，并将 `code/detail/traceId/issues` 完整转换为 `ApiError`。
3. 将现有 `PublishDraft` 适配为 `ApplicationDraft`。`metadata` 只为历史 skill/plugin/mcp 请求保留；应用写请求统一发送 `applicationDraft`。
4. 创建应用后保存返回的 `resourceId`，后续更新、版本、提交、审核和下架都使用该 ID；列表详情 URL 仍按 `ownerEmployeeId + slug` 查询。
5. 生产联调使用 `VITE_PORTAL_USE_FIXTURES=false`。Fixture 只用于本地无后端开发，不能作为真实状态来源。
6. 对 `DRAFT_VALIDATION_FAILED` 按 `issues[].path`（dotted string）定位表单字段；对认领冲突和状态冲突只做一次刷新，不做无限自动重试。
7. 前端不直接依赖数据库列名、Portal 历史事件或 reconciliation CLI；这些属于服务端内部实现。

## 9. 联调验收清单

- [ ] `AI Hub` 创建应用后，Portal 通过 `/internal/portal/apps/:ownerEmployeeId/:slug` 立即读到相同名称、摘要、状态和 `currentVersionId`。
- [ ] Portal 编辑应用后，AI Hub 应用详情和草稿读接口立即返回相同数据。
- [ ] `withdrawn → 编辑 → submit → approve → published` 在两套入口下结果一致。
- [ ] 提交后能看到版本快照和审核队列；审核通过前 `currentVersionId` 不提前变化。
- [ ] Cookie 认证和 `x-employee-id`/`x-session-id` 兼容认证均能完成受保护请求。
- [ ] 未登录（无 Cookie）时公开读端点（首页、列表、详情、评论读取）返回 200 且只含 `published` 资源；`isFavorited` 为 `false`。
- [ ] 携带无效会话访问公开读端点返回 `401`，不降级为匿名。
- [ ] 未登录访问写端点（发布、收藏、评论、投票）与 `dashboard/*` 返回 `401`。
- [ ] 匿名列表响应带 `Cache-Control: public, max-age=300` 与 `Vary: Cookie`；已登录响应为 `private, no-cache`。
- [ ] `PORTAL_APP_DRAFT_REQUIRED`、`DRAFT_VALIDATION_FAILED`、权限拒绝、审核认领冲突和 XSS 清洗均有可见且可恢复的前端行为。
- [ ] skill/plugin/mcp 的 Portal 读取、收藏、评论和原有写入行为不被应用统一改造影响。
- [ ] 前端完成 `npm run typecheck`、`npm run lint`、`npm test` 和 `npm run build`。

## 10. 服务端参考位置

- Portal 控制器：`D:\workspace\AI-HUB-PLATFORM\packages\server\src\portal\portal.controller.ts`
- Portal DTO：`D:\workspace\AI-HUB-PLATFORM\packages\server\src\portal\portal.dto.ts`
- Portal 服务委托：`D:\workspace\AI-HUB-PLATFORM\packages\server\src\portal\portal.service.ts`
- 标准应用服务：`D:\workspace\AI-HUB-PLATFORM\packages\server\src\application\application.service.ts`
- 契约类型：`D:\workspace\AI-HUB-PLATFORM\packages\contracts\src\application.ts`
- 真实数据库一致性 E2E：`D:\workspace\AI-HUB-PLATFORM\apps\api\test\portal-application-consistency.real.e2e-spec.ts`
- 认证兼容 E2E：`D:\workspace\AI-HUB-PLATFORM\apps\api\test\portal-auth.e2e-spec.ts`
- 匿名访问 E2E：`D:\workspace\AI-HUB-PLATFORM\apps\api\test\portal-anonymous.e2e-spec.ts`

如服务端契约发生变化，应先更新本文档和后端 OpenAPI，再由 Portal 适配层同步修改。
