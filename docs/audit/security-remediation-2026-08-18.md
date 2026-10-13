# 安全审查修复记录

修复批次：2026-08-18；文档合并：2026-10-07。

本文合并原安全修复总览、高危-1/2/3 和其余项处理报告。来源为 2026-08-17 的一次性安全审查，原审查在修复时已部分过时。以下结论与测试数量保留原批次证据，文档整理未重新执行安全测试，也不代表当前安全状态已复核。

## 问题与处置总览

| 原报告项                      | 当时核查结果                                                             | 处置                                       |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| 高危-1：API 边界输入校验      | 已注册管道，但 `tsx` 不生成 DTO 装饰器元数据；Query 与一处 Body 缺少 DTO | 补齐 DTO，运行与测试改用 SWC 元数据        |
| 高危-2：会话凭据暴露          | localStorage 凭据问题已修；会话 Cookie 缺 `Secure`                       | 补生产默认与显式配置                       |
| 高危-3：富文本存储型 XSS      | 前后端已有净化；`data:` 与协议相对 URL 的规则不一致                      | 收紧前端规则并补真实载荷测试               |
| 中危-5：异常 detail 回显      | 存在未转义与原文泄露路径                                                 | HTML 转义、安全 code 校验与固定 title 回退 |
| 中危-4：SSRF 校验未接线       | 钉钉外部请求未调用目标校验                                               | 两个抓取点均接入校验                       |
| 中危-6：重放 nonce 的用户绑定 | 中间件先于鉴权，只有占位 actor                                           | 保留未解决状态，需鉴权后的架构调整         |
| 严重-1/2：提审、驳回误下架    | 已有 `pendingVersionId` 与 `sourceStatus` 回滚                           | 原报告过时，未修改业务逻辑                 |
| 中危-3：审核队列终态          | `completeReviewQueue` 已置 `completed`                                   | 原报告过时                                 |
| 中危-4biz：所有者可见性       | 已放行 owner、maintainer 与 `APPLICATION_MANAGE`                         | 原报告过时                                 |
| 中危-5biz：并发双赞           | 已有复合主键与冲突忽略                                                   | 原报告过时                                 |
| 低危-6/7：Outbox 幂等去重     | 随机幂等键与缺失的冲突处理使重复事件无法去重                             | 四个仓储补键与冲突处理，五个调用点接稳定键 |

## API 输入校验

`ValidationPipe` 依赖 `design:paramtypes` 识别 DTO。原 `tsx` / esbuild 运行方式缺失该元数据，管道会跳过校验；仅注册管道不能证明边界有效。

- 全量扫描 14 个 Controller、约 40 处 Query 和一处行内 Body；为 catalog、application、demand、feedback、interaction、identity、security、analytics 的 Query 补 DTO。
- `packages/server/src/system/http/pagination.dto.ts` 提供 `PaginationQueryDto`，分页范围 1–200；模块 DTO 约束排序、状态、渠道等枚举与字符串长度，长度使用 `@MaxLength`。
- `unified-upload.controller.ts` 的行内 `{ signature?: string }` 改用 `CompleteUnifiedUploadBodyDto`；既有管道配置与已校验 Body 保留。
- API `start` / `dev` 改为 `node --import @swc-node/register/esm-register src/main.ts`，`.swcrc` 开启 `legacyDecorator` 与 `decoratorMetadata`；SWC 运行依赖移入 `dependencies`。
- 输入校验 e2e 使用 `vitest.input-validation.config.ts` 与 `unplugin-swc`，默认 esbuild 套件排除该 e2e，避免元数据缺失导致误判。

原批次证据：DTO 单测 13/13、真实管道与 Controller e2e 8/8、生产启动命令成功、相关文件类型检查通过。`@Param` 枚举仍只有 TypeScript 类型断言，下游存在性与归属校验不能替代入口枚举校验。

## 会话 Cookie

当时前端已停止把 `sessionId` 写入 localStorage，共享请求客户端使用 HttpOnly Cookie；前端只读取用于 double-submit CSRF 的 `csrf_token`。非敏感 `employeeId` 与 UI 偏好不作为认证依据。

- `packages/server/src/identity/session-cookie.ts` 的 `buildSessionCookieAttributes` 构造 `Path=/; HttpOnly; SameSite=Lax[; Secure]`。
- `shouldSecureSessionCookie` 优先读取 `AIHUB_SESSION_COOKIE_SECURE=true|false`；缺省仅 `NODE_ENV=production` 开启，开发与测试保留 HTTP 可用性。
- `identity.controller.ts` 为 `aihub_sid` 与 `aihub_eid` 应用相同属性；登出清 Cookie 逻辑保持原样。
- 守卫优先读取 Cookie，身份请求头保留非浏览器客户端兼容；钉钉 SSO Cookie 当时已带 `HttpOnly; Secure; SameSite=Lax`。

原批次证据：`session-cookie.spec.ts` 8/8，覆盖属性、环境覆盖与真实 Controller 路径；`identity.e2e-spec.ts` 1/1；相关服务端类型检查通过。生产使用 HTTPS；显式关闭 `Secure` 会恢复明文发送风险，非生产 HTTPS 预发可显式设为 `true`。

## 富文本净化

当时前端 `sanitize.ts` 已使用 DOMPurify 白名单与锚点 `rel="noopener noreferrer nofollow"`，`RichTextView` 渲染和 `RichTextEditor` 加载、提交均调用净化。后端 `content-security.ts` 使用 sanitize-html，`application.service.ts` 在落库前校验三个富文本字段。

- 前端增加 URI 负向匹配与 `uponSanitizeAttribute` 钩子，移除 `href` / `src` 的 `data:` 和 `//host` 地址。
- DOMPurify 3.2.4 不支持 `allowProtocolRelative`，因此移除无效选项；默认 `DATA_URI_TAGS` 无法通过追加配置移除 `img`，由钩子的 `keepAttr=false` 兜底。
- 后端已有 `allowedSchemes: http/https/mailto`、`allowProtocolRelative:false` 与拒绝式 `assertSafeRichText` / `assertSafeSvg`，该批次只补测试。
- 扫描范围为 `apps/web/src`：HTML 写入点只有已净化的 `RichTextView` 与 `RichTextEditor`，未发现其他列举的注入 sink。独立过程看板不属于用户富文本落库路径。

原批次证据：前端 `sanitize.test.tsx` 12/12，覆盖 script、iframe、SVG 事件、图片 onerror、危险 URI、合法内容保留与真实 DOM 断言；后端 `content-security.spec.ts` 12/12，覆盖危险标签、事件、协议、注释与拒绝路径。`assertSafeSvg` 当时按设计拒绝完整 `<svg>` 根标签。富文本回声回归 3/3，前端类型检查通过。

## 其余实际修复

### 异常回显

`packages/server/src/system/http/problem-details.filter.ts` 对 `detail` 做 `< > & " '` 的 HTML 实体转义，以 `SAFE_DOMAIN_CODE` 校验 `code`，没有安全 detail 时回退固定 title。JSON 本身不执行脚本；此处防止错误消息被误作 HTML 渲染，并避免直接暴露异常原文。`problem-details.filter.spec.ts` 6/6，覆盖恶意载荷、常量 detail、字符串响应与回退。

### 钉钉外部请求

`dingtalk-api.client.ts` 的 OAuth 与用户信息抓取先调用 `assertPublicHttpTarget` 再出站，复用 `ssrf-policy.ts` 的目标策略。新增 `validatedTargets: Map<string, Promise<URL>>` 与 `assertTarget`，失败时清缓存供重试。`dingtalk-api.client.spec.ts` 4/4，mock 目标校验避免真实 DNS，断言两端点均校验且拒绝时不调用 fetch；这些测试不等于真实网络验证。

### Outbox 幂等

application、feedback、demand、interaction 四个仓储的 `emitOutbox` 接收可选 `idempotencyKey`，插入时按 `idempotency_key` 使用 `onConflict(...).doNothing()`。五个业务调用点传入稳定键：

- `feedback-created:${record.feedbackId}`
- `feedback-status-updated:${input.feedbackId}:${input.status}`
- `demand-comment-created:${comment.commentId}`
- `demand-report-created:${report.reportId}`
- `demand-report-resolved:${report.reportId}`

原批次 `feedback.service.test.ts` 9 例与 `demand.service.test.ts` 20 例通过；新增断言检查传入幂等键包含实体 ID。其余项共四套件 39/39，server 全量类型检查零错误。

## 原报告中过时的业务结论

- `application.service.ts` 的 `submitDraft` / `submitForReview` 使用 `pendingVersionId`，已发布应用提审时保持 `published`；`review` 驳回按 `sourceStatus` 回滚，通过后完成审核队列。
- `application.repository.ts` 的 `completeReviewQueue` 已写入 `completed`。
- `catalog-visibility.policy.ts` 的 `requireVisibleOrManageable` 放行 owner、maintainer 与 `APPLICATION_MANAGE`，feedback 与 interaction 服务已使用该策略。
- `interaction.repository.ts` 的 `addLike` 使用冲突忽略，migration 0004 的 `application_likes` 复合主键阻止重复行。

这些项目在原批次只核查、未修改业务逻辑；不能据历史报告重复实施修复。

## 保留的未完成事项

- 中危-6：生产安全中间件先于 NestJS 鉴权守卫，nonce 使用 `actorEmployeeId: "authenticated-request"`。直接读取可伪造身份请求头不能完成真实用户绑定；需在鉴权后由守卫或拦截器处理，原批次未实施。
- 输入校验：评估 `@Param` 枚举约束，将专用输入校验测试接入 CI，并核对调查时安装的 `ts-node` / `ts-node-dev` 是否仍有用途。
- 安全状态应在后续复盘重新核查；原一次性审查不能继续作为当前缺陷清单。编辑器选型不属于该批次安全修复的必需范围。

## 历史验证命令

```powershell
pnpm --filter @ai-hub/server exec vitest run src/system/http/input-validation.spec.ts
pnpm --filter @ai-hub/api exec vitest run --config vitest.input-validation.config.ts
pnpm --filter @ai-hub/server exec vitest run src/identity/session-cookie.spec.ts
pnpm --filter @ai-hub/web exec vitest run src/shared/ui/sanitize.test.tsx
pnpm --filter @ai-hub/server exec vitest run src/application/content-security.spec.ts
pnpm --filter @ai-hub/web exec vitest run src/pages/creator/ApplicationCreateWizardPage.echo.test.tsx
pnpm --filter @ai-hub/server exec vitest run src/system/http/problem-details.filter.spec.ts src/identity/dingtalk-api.client.spec.ts src/feedback/feedback.service.test.ts src/demand/demand.service.test.ts
pnpm --filter @ai-hub/server exec tsc --noEmit
```

命令来自原批次报告。再次执行前核对当前测试入口；本次整理只检查文档与文件引用。
