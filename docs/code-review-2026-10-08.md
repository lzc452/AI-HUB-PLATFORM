# AI-HUB-PLATFORM 代码审查与优化报告

> 审查日期：2026-10-08
> 状态复核：2026-10-09（逐条回源码核实，纠正了 3 处不实的 ✅ 标记）
> 审查范围：全仓 639 个源文件 / 约 12.9 万行（`packages/server` 5.3万、`apps/web` 4万、`packages/database` 1.9万）
> 方法：分模块并行静态审查 + 逐条现场代码核实 + 修改后回归验证

---

## 零、状态复核（2026-10-09）

> **本节是复核结论，与下方各条的 ✅ 标记冲突时以本节为准。**
>
> 复核方式：逐条 grep 源码验证修复是否真实存在，不采信标记本身。
> 发现 **3 处标记与代码不符**——其中 2 处标记为 ✅ 但完全未修，1 处为部分修复。

| 条目 | 原标记 | 复核结论 | 证据 |
|---|---|---|---|
| **P0-1 连接池可导致进程崩溃** | ✅ | ✅ **已补修**（复核时未修，当日已修） | 首轮复核为完全未修；现已加 `pool.on("error")` + 池参数外部化 + `statement_timeout`，`database.test.ts` 5 用例含反向验证 |
| **P0-2 并发审核可写入两条结论** | ✅ | ✅ **已补修**（复核时仅部分，当日已补完） | 首轮复核：唯一约束已加但 `completeReviewQueue` 仍无 CAS。现已加 `.where("status","=","claimed")` 并把 CAS 前置到事务第一步，真实 PG 并发测试 4 条含反向验证 |
| **P1-5 乐观锁冲突被降级为 400** | ✅ | ✅ **已补修**（复核时未修，当日已修） | 首轮复核为完全未修；现已新增 `system/http/domain-error.ts` 作单一映射来源，demand（24 处 `DEMAND_CONFLICT`）与 application 均接入，controller 层5 条用例含反向验证 |
| P0-3 表单可重复提交 | ✅ | ✅ 属实 | `FormWizard.tsx:73-74` 有 `submittingRef`/`savingDraftRef`，`:119-120` 在 await 前置位 |
| P0-4 全项目零 ErrorBoundary | ✅ | ✅ 属实 | `apps/web/src/shared/ui/ErrorBoundary.tsx` 存在 |
| P0-6 角色权限写入 jsonb | ✅ | ✅ 属实 | `identity.repository.ts:33` 有 `toJsonb`，`:351,356` 已使用 |
| P1-1 上传预览内存泄漏 | ✅ | ✅ 属实 | `useObjectUrlRegistry.ts` 存在，`:28,43` 有 `revokeObjectURL` |
| P1-2 预览步打字期性能塌陷 | ✅ | ✅ 属实 | `steps.tsx` 内 `useWatch` 出现 13 次（精确订阅） |
| P1-3 审核页灰按钮无任何提示 | ✅ | ✅ 属实 | `ApplicationReviewPage.tsx:171,454,461` 有 `disabledReason` |
| P1-4 审核队列三张表零索引 | ✅ | ✅ 属实 | `0055_review_integrity_and_indexes.ts` 建 8 个索引 |
| P1-6 安全审计 IP/UA/traceId 丢弃 | ✅ | ✅ 属实 | `audit.repository.ts:73,80,81` 三者均已落库 |
| 第四节 受众隔离完全失效 |列为「最严重未修问题」 | ✅ **已修复**（复核时已修） | 新增 `authorization/audience-visibility.ts`，portal 仓储 6 处读路径接入；`voteHunt` 在写库前校验；`portal-audience.real.e2e-spec.ts` 6/6 通过 |

**为什么会出现不实标记**：修复集中在服务端的批次（可被 `tsc` 与单测验证），
而 P0-1 在 `packages/database`、P1-5 涉及的 `ConflictException` 未被任何现有门禁覆盖——
**标记是人工写下的，没有回源码核对的机制**。这与本报告 P0-6 的教训同源：
「内存替身掩盖真实 PG 问题」等价于「勾选框掩盖未落地的问题」。

**新增已修复项（2026-10-09 批次，均由真实依赖测试暴露）**：

| 问题 | 位置 | 说明 |
|---|---|---|
| 通知授权器按不存在的角色码判定 | `notification.module.ts` | `application_reviewer` 在 `SYSTEM_ROLE_DEFINITIONS` 中不存在 → 所有审核通知被全量拒绝。改为按权限码判定 |
| 停用角色后 API 仍可操作 | `identity.service.ts` `getActorContext`/`authorize` | `listEmployeeRoles` 不过滤 `roles.status`；`authorize()` 重新读库二次合并绕过收敛。已加 `RoleRecord.active` |
| 需求附件完全不扫描（fail-open） | `demand.controller.ts` | 端点直接落库、未注入扫描器，EICAR 被正常入库。新增 `scanContent` 并在落盘前扫描 |
| clamd INSTREAM 提前半关闭 | `scanner.clamav.ts` | `socket.end(terminator)` 关闭写侧致 clamd 回空响应 → **生产环境恶意文件扫描静默失效** |
| 分页未下推 SQL | `demand.repository.ts` / `application.repository.ts` | `demand.list()` 与 `listAdmin` 全表捞出后应用层切片；`channel` 过滤下推 `EXISTS` |
| CSV 导入 N+1 | `identity.service.ts` | `Promise.all` 并发逐行查询（5000 行 = 1万次）→ 批量预取，降级时串行 |

---

## 一、总体结论

仓库的**工程基线明显高于平均水平**：pnpm monorepo职责划分清晰、dependency-cruiser 边界规则齐备、`verify.mjs` 把验证契约本身当作可测对象、前端零 `any`、React Query 用法规范、skip-link 等无障碍细节到位。

问题**不在架构，而在实现层的局部缺��和几处并发正确性缺陷**。本次审查定位 6 个P0/P1 级问题并已全部修复验证，其中 2 个属于真实的数据一致性缺陷。

---

## 二、已修复问题（全部经代码核实与回归验证）

### P0-1 连接池可导致进程崩溃 ✅ 已修复（2026-10-09）

> **原标记 ✅ 有误**：2026-10-09 首次复核时该项**完全未修**
> （`database.ts` 仍 `max: 10` 硬编码、无 `pool.on("error")`），现已实际修复。

**文件**：`packages/database/src/database.ts`、`database.test.ts`（新增）

**问题**：建池时未监听 `pool.on("error")`。node-postgres 在空闲连接被数据库或网络层断开时会 emit `error` 事件，无监听器时 Node 默认行为是**直接 crash 进程**。生产环境 PG 主备切换、容器网络抖动、云厂商连接保持超时均会触发——而 `compose.production.yaml` 的 worker 是单服务无副本，一旦崩溃 outbox 消费直接停摆。

同时 `max: 10` 硬编码、不随环境变化，且缺 `idleTimeoutMillis` / `statement_timeout`。

**修复**：
1. **注册 `pool.on("error")`** —— 空闲连接出错只记录不抛出，池自行丢弃坏连接并补建，
   业务侧感知为一次短暂失败，而非未捕获异常终止进程。
2. **池参数外部化**为 `DATABASE_POOL_MAX` / `DATABASE_POOL_CONNECT_TIMEOUT_MS` /
   `DATABASE_IDLE_TIMEOUT_MS` / `DATABASE_STATEMENT_TIMEOUT_MS`，
   **非法值（`abc` / `0` / `-1` / 小数）回落默认并打警告**——
   编排文件里手写错一个值不该让服务起不来，但也要留痕以便排查
   「我明明配了20 怎么没生效」。
3. **补`statement_timeout`**（PG 侧兜底）—— 此前一条写错的慢查询可以永久占住连接，
   最终表现为「连接池耗尽」这类难以定位的故障。

**验证**：`packages/database/src/database.test.ts` 5 条用例，含**反向验证**
（无 `error` 监听器时 `emit("error")` 确实抛异常 → 证明该风险真实存在）。
反向验证也确认了修复有效：加监听后同一调用不再抛出。

**文件**：`packages/database/src/database.ts:5-15`

**问题**：建池时未监听 `pool.on("error")`。node-postgres 在空闲连接被数据库或网络层断开时会 emit `error` 事件，无监听器时 Node 默认行为是**直接 crash 进程**。生产环境 PG 主备切换、容器网络抖动、云厂商连接保持超时均会触发——而 `compose.production.yaml` 的 worker 是单服务无副本，一旦崩溃 outbox 消费直接停摆。

同时 `max: 10` 硬编码、不随环境变化，且缺 `idleTimeoutMillis` / `statement_timeout`。

**改进**：补错误监听（消除 crash 风险）；池参数外部化为`DATABASE_POOL_MAX` / `DATABASE_IDLE_TIMEOUT_MS` / `DATABASE_STATEMENT_TIMEOUT_MS`，带非法值回落默认。

---

### P0-2 并发审核可写入两条结论 ✅ 已修复（2026-10-09）

> **原标记 ✅ 有误**：首次复核时该项**仅数据库层已加固**，
> 应用层 CAS 仍缺。现已补完。

**文件**：`packages/server/src/application/application.repository.ts`、
`application.service.ts`、`apps/api/test/review-queue-cas.real.e2e-spec.ts`（新增）

**问题**：`review()` 的队列状态检查在**事务外**，事务内第一条语句 `createReview()` 是纯 INSERT，
而 `completeReviewQueue()` **没有 CAS**（对比同文件 `claimReviewQueue:1485`
有 `.where("status","=","available")`）。

**并发时序**：两个并发 approve 都能通过事务外检查 → 各写一条审核记录 → `application.published`
事件触发两次 → 目录重复注册 → 责任人收到两条通知。对 `published → published` 的更新审核，
`setApplicationStatus` 的 CAS 兜底也失效（状态没变化，WHERE 恒成立）。

**为什么唯一约束救不了**（原报告未点明，是本案关键）：
`0055` 建的 `application_reviews_version_reviewer_unique` 维度是
`(application_version_id, reviewer_employee_id)` —— 两个**不同**审核员各写一条**并不冲突**。
所以并发场景下这条约束完全无效，唯一的防线就是应用层 CAS。
（另注：`0055` 文件头注释称该约束「已由 0003 建出」，与实际不符——
`0003` 只有 `application_versions` / `application_deliveries` 等处的 unique，
该约束实为 `0055:62` 新建。注释与实现不一致，会误导后续维护者。）

**修复**：
1. `completeReviewQueue` 加 `.where("status","=","claimed")`，
   未命中抛 `REVIEW_QUEUE_CLAIM_REQUIRED`（预期内业务拒绝，经 `domain-error.ts` 映射为 409）。
2. **把 CAS 调用移到事务第一步**（原先在事务末尾）。这一点比加 CAS 本身更关键：
   放在末尾时，两个并发事务都能通过前面的检查、各自写入一条评审记录，
   到最后一步才失败——而唯一约束按 `(version, reviewer)` 维度，两个不同审核员都不冲突，
   于是「靠 DB 回滚兜住并发」这条路也走不通。
   前置 CAS 让第二个事务**在写任何东西之前**失败。

**验证**：`apps/api/test/review-queue-cas.real.e2e-spec.ts` 4 条（真实 PostgreSQL）：
- claimed 队列可正常完成
- 第二次完成必须失败（核心）
- available 队列不能跳过认领直接完成
- 并发双击只有一次成功，且最终状态为 completed

**已做反向验证**：临时移除 `.where("status","=","claimed")` 后3 条用例如期失败
—— 证明测试确实覆盖该缺陷，而非恰好通过。

**连带修正的测试期望**：`phase5.real.e2e-spec.ts` 有**两处**并发断言
（认领、协作者分配）期望 `[201, 400]`，P1-5 修复后正确返回 409。
这属于「测试期望过时」而非回归 —— 参数完全正确，是别人先改了状态，
400 会让客户端当成参数写错。已更新并写明原因。

**验证过程**：临时移除内存替身的 CAS 守卫后，新增测试确实失败（第二个请求报`APPLICATION_STATE_CONFLICT`，且审核记录已重复写入），确认测试能捕获真实缺陷。

**改进**：
1. 新增迁移 `0055`：为 `application_reviews` 加唯一约束 `(application_version_id, reviewer_employee_id)` —— 数据库层最终防线；
2. `completeReviewQueue()` 增加 `.where("status","=","claimed")` CAS，失败抛 `REVIEW_ALREADY_DECIDED`；
3. 将CAS **前置到事务第一步**，事务外的状态检查降级为纯 UX 快速失败；
4. 新增并发回归测试，断言「同一版本同一审核人只有一条结论、发布事件只触发一次」。

---

### P0-3 表单可重复提交 ✅

**文件**：`apps/web/src/shared/forms/FormWizard.tsx`

**问题**：`handleNext` 有同步守卫 `advancingRef`（在**任何 await 之前**置位，写法正确），但 `handleSubmit` 与 `handleSaveDraft` 遗漏了。`handleSubmit` 需串行校验全部步骤（zod 解析多段富文本HTML 耗时可观），该窗口内 `loading={submitting}` 尚未置位，按钮仍可点→ 并发启动两条校验链并各自提交。

**用户影响**：向导第4 步点两下「提交审核」→ 两次 `saveApplicationDraft` + `submitApplicationDraft` → 后端第二次返回状态机冲突，用户看到「已提交」后又弹红色报错。

**改进**：`submittingRef` / `savingDraftRef` 两个独立守卫，均在任何 `await` 前置位；`setSubmitting(true)` 提到校验循环之前，让 loading 覆盖整个校验期。

---

### P0-4 全项目零 ErrorBoundary ✅

**文件**：`apps/web/src/shared/ui/ErrorBoundary.tsx`（新增）、`providers.tsx`

**问题**：grep 全量 `componentDidCatch|ErrorBoundary` **零命中**。任一页面组件渲染抛错（仓库内有大量 `as` 断言与 `!` 非空断言）都会导致整站白屏，只能硬刷新。

**用户影响**：审核工作台白屏 = 审核员完全无法工作，属明确的可用性事故。

**改进**：新增 `ErrorBoundary`（含错误信息展示与「重新加载/重试」两个动作，保留 stack 便于反馈），挂载于 `AppProviders` 最外层。

---

### P1-1 上传预览内存泄漏 ✅

**文件**：`apps/web/src/modules/publishing/steps.tsx`、`useObjectUrlRegistry.ts`（新增）

**问题**：三处 `URL.createObjectURL`（图标 `:255`、历史截图回显 `:370`、新截图 `:400`）**全文件零 `revokeObjectURL`**。每次上传/换图标泄漏一份 Blob，截图最多 6 张，向导反复编辑时累积明显。

**改进**：新增 `useObjectUrlRegistry` hook 以 url 为键登记，支持「替换/移除单项时精确释放」与「卸载时兜底全释放」。在 `syncFiles` 统一收敛点释放「不再存在于新列表」的 url —— 避免整表清空式 revoke 导致可见预览图变空白。另处理了 `cancelled` 分支与上传失败回滚路径的泄漏。

---

### P1-2 预览步打字期性能塌陷 ✅

**文件**：`apps/web/src/modules/publishing/steps.tsx` `PreviewStep`

**问题**：两个问题叠加——`FormWizard` 为保住上传预览使所有步骤**常驻挂载**（`display:none`），而 `PreviewStep` 用**无参 `watch()` 订阅整个表单**。用户在第 1 步每敲一个字，隐藏的预览步就重渲染一次并触发 **3 次 DOMPurify 全量清洗**（此时富文本字段多为空串）。

**改进**：改为 `useWatch` 精确订阅预览实际读取的 17 个字段（已 grep 逐一核对 `draft.xxx` 全部读取点，避免漏订阅导致显示为空）。

---

### P1-3 审核页灰按钮无任何提示 ✅

**文件**：`apps/web/src/pages/applications/ApplicationReviewPage.tsx:456-460`

**问题**：解释按钮 disabled 含义的提示块**被整段注释掉**，导致新审核员看到「通过/驳回」按钮灰着却不知原因，页面上无任何文字说明（`:271` 用了 `title` 属性，但触屏不可达）。

**改进**：将单一 `canDecide` 布尔改为显式 `disabledReason`，区分三种成因并给出可读文案：无待审版本 / 禁止自审 / 请先领取任务。

---

### P1-4 审核队列三张表零索引 ✅

**文件**：`packages/database/src/migrations/0055_review_integrity_and_indexes.ts`（新增）

**问题**：迁移 `0003` 创建的 `application_review_queue` / `application_reviews` / `application_audit_events` **全文件零 `createIndex`**（已核实），后续迁移也从未补建。PostgreSQL **不为外键自动建索引**，这是常见误区。

**影响**：SLA 提醒与超时释放任务**每 15 分钟全表扫描**队列表，而队列表随每次提交单调增长，多副本部署时是 N倍全表扫。

**改进**：新增 8 个索引，含 partial index（`where status <> 'completed'` / `where status = 'claimed'`）把索引体积压到只覆盖活跃行；另补 `outbox_events` 的 `aggregate_id`（对账高频查询）与 `completed_at`（清理任务需要）索引。

---

### P1-5 乐观锁冲突被降级为 400 ✅ 已修复（2026-10-09）

> **原标记 ✅ 有误**：首次复核时该项**完全未修**
> （全仓 `ConflictException` 零使用、`domain-error.ts` 不存在），现已实际修复。

**文件**：`packages/server/src/system/http/domain-error.ts`（新增）、
`domain-error.spec.ts`、`demand.controller.conflict.spec.ts`（均新增）、
`demand.controller.ts`、`application.controller.ts`

**问题**：`demand` 用 `expectedVersion` 做乐观锁，冲突抛 `DEMAND_CONFLICT`
（`demand.repository.ts` 中共 **24 处**抛出），但 controller 的错误映射
**没有登记这个码**，兜底成 `BadRequestException`(400)。
全仓 `ConflictException` **零使用**，尽管 `problem-details.filter.ts:29` 已定义 409 映射。

**用户影响**：两个审核员同时操作，后提交者收到 400「参数错误」——
语义错误，客户端只对 409 触发重试，因此**永远不会重试**，
用户看到误导性提示且必须手动刷新。

**修复**：
1. 新增 `domain-error.ts` 作为**错误码 → HTTP 语义的单一映射来源**。
   此前已有 **7 个 controller 各写一份**字符串匹配清单，清单一多必然漂移——
   `DEMAND_CONFLICT` 漏进兜底分支正是这种漂移的结果。
2. 判定原则写入注释：**客户端拿到这个错误后，重新读取状态再重试是否有意义？**
   - 有（乐观锁冲突 `DEMAND_CONFLICT` / `APPLICATION_STATE_CONFLICT`、
     状态机已迁移的 9 个 `*_INVALID_STATE`）→ 409
   - 没有（缺参数、格式错）→ 保持 400
3. 未知错误码**保守落回 400**：误判成 409 会让客户端白白重试。
4. 同时修正 `application.controller.ts`（`APPLICATION_STATE_CONFLICT` 同样漏登记）。

**验证**：
- `domain-error.spec.ts` 5 条：含「未知码不被误判为 409」的反向断言。
- `demand.controller.conflict.spec.ts` 5 条：直接在 **controller 层**断言 HTTP 状态码
  （`grep expect(409)` 在原集成测试中零命中，这类映射缺陷单测看不见）。
  另含反向断言：403/404/400 **不得**被误升为 409。
- **已做反向验证**：临时把 controller 改回 `throw new BadRequestException(code)`
  后，2 条 409 用例如期失败——证明测试确实覆盖该缺陷，而非恰好通过。

**文件**：`packages/server/src/system/http/domain-error.ts`（新增）、`problem-details.filter.ts`

**问题**：`demand` 用 `expectedVersion` 做乐观锁，冲突抛 `DEMAND_CONFLICT`（`demand.repository.ts:269,274-278`），但 controller 的 `rethrow` 字符串匹配里**没有这个码**，兜底成 `BadRequestException`（`demand.controller.ts:1235`）。全仓 `ConflictException` **零使用**，尽管 `problem-details.filter.ts:29` 已定义 409 映射。

**用户影响**：两个审核员同时操作，后提交者收到 400「参数错误」——语义错误，客户端只对 409 触发重试，因此不会重试，用户看到误导性提示。

**改进**：新增 `DomainError` 类型承载 HTTP 语义（service 层无需依赖框架类型），filter 统一转换；并对遗留字符串错误码做冲突码兜底纠正为 409，同时避免冲突进error 日志（它们是预期内业务拒绝，非未处理异常）。

---

## 二之二、阶段二集成验证中新发现的两个缺陷 ✅

> 这一节的两个问题**不在首轮静态审查清单里**，是在阶段二为安全审计做真实端到端验证时，被"跑起来看真实行为"暴露出来的。两者都通过了全部既有单测与类型检查。

### P0-6 角色权限写入 jsonb 全线失败（角色管理不可用）✅

**文件**：`packages/server/src/identity/identity.repository.ts:307,329,396`

**根因**：`createRole` / `updateRole` / `copyRole` 三处都把 `string[]` 直接交给 Kysely 写 `jsonb` 列：

```ts
.values({ role_code: ..., permissions: input.permissions })   // ←错
.set({ permissions: input.permissions })                      // ← 错
```

pg 驱动按 **PostgreSQL 数组字面量**序列化，产出 `{"a","b"}`；而 `jsonb` 只接受 JSON，PG 直接报 `invalid input syntax for type json`。已实测确认：

```
select '{"a","b"}'::text::jsonb;
ERROR:  invalid input syntax for type json
DETAIL:  Expected ":", but found ",".
```

**用户影响**：**创建角色 / 权限变更 / 角色复制三条接口在真实数据库上 100% 失败**。叠加第二层放大：`identity.controller.ts:rethrow` 把真实错误码交给 `BadRequestException(code)`，但 `problem-details.filter.ts` 的 `SAFE_DOMAIN_CODE = /^[A-Z][A-Z0-9_]{2,63}$/` 校验不通过，回落到兜底 `BAD_REQUEST`——响应体完全看不出是序列化问题，排障时只能靠服务端日志。

**为什么单测没抓到**：4560 行的 application/identity 测试全部用内存仓储替身，从不触碰真实 PG 的类型序列化。

**改进**：新增 `toJsonb()` 辅助（`sql\`${JSON.stringify(value)}::jsonb\``），三处统一使用，与 `identity.repository.ts:243` 及 `demo-seed.ts:196` 的既有写法一致。**并补真实数据库回归测试**（`apps/api/test/identity-role-permissions-jsonb.real.e2e-spec.ts`，4 个用例覆盖三处写入 + 空数组边界 + 只改 name 不动权限）。该测试已反向验证：临时撤销修复后 4/4 失败且报错与线上一致，确认非假绿。

### P1-6 安全审计的 IP / UA / traceId 被静默丢弃 ✅

**文件**：`packages/server/src/system/security/audit.service.ts`

**根因**：`SecurityAuditRecord` 接口**没有声明** `ipAddress` / `userAgent` / `traceId`，而 controller 用展开语法传入：

```ts
await this.audit.recordSecurityEvent({
  action: "identity.login.failed",
  ...requestAuditFields(req),   // ← 这三个字段被静默丢弃
});
```

TypeScript 的 excess property check **只对对象字面量生效**，对展开表达式中的多余属性不报错——于是类型检查全绿、审计照写，只是三列恒为 NULL。首次集成验证查库时实测到：`details` 里有 traceId，但 `trace_id` 列是空的。

**用户影响**：`security_audit_events` 上专门建的 `security_audit_events_trace_idx` 索引完全失效，「按 traceId 串联一次请求的全部安全事件」这一排障主路径不可用；按 IP 追撞库来源同样不可用。

**改进**：
1. `SecurityAuditRecord` 显式声明三个字段，并在 `recordSecurityEvent` 中转发（附注释说明这段历史）。
2. **traceId 改为在 service 层兜底取`getTraceId()`**（AsyncLocalStorage），而不是要求每个调用点显式传。原因是 service 层写路径（如 `identity.updateRole`）拿不到 `Request` 对象，一旦漏传就静默为 NULL，且漏传在类型层面无法被发现。
3. 新增 `audit.service.test.ts`（7 个用例），其中 3 个专门锁定本缺陷。

---

## 三、审查发现但本次未改的问题（按优先级）

### P0

| 问题 | 位置 | 建议 |
|---|---|---|
| **安全审计几乎全面缺失**：`AUDIT_EVENT_CATALOG` 定义 23 个事件，但 `AuditService.recordEvent` **全仓唯一调用方是它自己的定义**；生产代码仅 3 处写 `security_audit_events`，业务域走另外两张无 `trace_id` 的表；**登录失败完全无审计** | `audit.catalog.ts:2`、`identity.controller.ts:810` | 补登录失败审计（合规硬要求）；把 `AuditEventInput.action` 从 `string` 收窄为 `AuditEventType`，让编译器暴露所有「该写没写」的位置 |
| **4560 行单测用 `allowAll` 恒真授权桩 + 内存仓储**，事务/并发语义与生产不一致；回滚测试仅在替身上验证 | `application.service.test.ts:775,125-140` | 替身明确降级为「业务规则单测」并注释说明；补application 仓储的集成测试 |
| **两个真实测试套件从未被 `verify` 调用**：`test:api-data`、`test:input-validation` 无调用方；后者注释明确说明 `ValidationPipe` 在 vitest 下会完全跳过校验 | `scripts/verify.mjs:9` | 并入 `verificationCommands`；补 meta 测试断言所有 vitest 配置都被覆盖 |

### P1

| 问题 | 位置 | 建议 |
|---|---|---|
| **outbox 慢 handler 无超时/无心跳**：抢占后事务立即提交，handler 在事务外执行，`OUTBOX_BATCH_SIZE=1` 只解决排队不解决「handler 本身超 lease」。ClamAV 扫描 + 对象存储上传超 15 分钟租约完全可能，届时第二个 worker 会并发重复消费 | `outbox-worker.ts:8-10`、`artifact-verification.worker.ts:49-91` | 加 handler 硬超时 + lease 心跳（`renewLease`）；心跳失败即放弃写操作 |
| **指标 `route` 标签取原始 URL**，含路径参数 → Prometheus 基数爆炸，每个资源 ID 一条时间序列 | `request-context.middleware.ts:63` | 注入路由表做模式归一化；过渡方案正则替换 ID 段 |
| **两处「全表捞出 + 应用层分页」**：`demand.list()` 54 行 SQL 无 `limit`；`application.listAdmin` 跨 3 张表万级 IN 查询后才 `slice` | `demand.service.ts:1157`、`application.repository.ts:1350-1420` | 分页下推 SQL；`channel` 过滤改 `EXISTS` 子查询 |
| **identity CSV 导入无界 N+1**：`previewEmployeeImport` 每行 2 次查询，且 `rows` **无 `@ArrayMaxSize`**，5000 行 = 1万次并发查询打满连接池 | `identity.service.ts:818-850`、`identity.dto.ts:658` | 加 `@ArrayMaxSize(500)`；改批量查询 + 内存分组 |
| **`publish()` 依赖不可达状态 `"approved"`**：全代码无任何路径写入该状态，路由对外暴露但必然 400 | `application.service.ts:1158,1167` | 删除死代码，或接线为两阶段发布 |
| **幂等键含 `Date.now()`**：退化为随机数，重试必然产生重复行 | 13 处，如 `application.service.ts:1570` | 改业务语义键；SLA 判定建议引入 `ClockPort` |
| **CI 无数据库**：`verify.yml` 无 `services:`、未设 `TEST_DATABASE_URL`，而 `ci-config.test.mjs:46` 却断言了该变量被透传——**假断言** | `.github/workflows/verify.yml` | 增加 postgres service；修正断言为校验 CI 确实设置了该变量 |
| **`api` 套件有 3 个文件 / 7 个用例既有失败**（已确证与本轮修复无关），其中 `portal-audience.real.e2e-spec.ts` **6/6 全失败暴露受众隔离完全缺失**：五种角色全部看到全部 5 条应用，且对未授权受限应用投票期望 404 实得**201 Created**、投票已落库。定位结论：服务端**根本没有受众过滤实现**（非回归，是功能未完成），但需求与测试用例已完整存在 | `portal-audience.real.e2e-spec.ts:248,320` | **最高优先**：先明确 V1 是否要求受众隔离；若要求，需在 `listResources` / `findResource` / 投票三条路径统一实现（投票必须服务端校验）；并把该套件并入 `verify`，否则越权长期无护栏 |
| **`repository-governance.mjs` 只检查 `.codex/` 3 个文件**，凭据扫描覆盖面≈0.01%，却名为「仓库治理」 | `repository-governance.mjs:54-55` | 用 `git ls-files` 扩展至全仓 |

### P2（结构性，建议排期）

- **`steps.tsx` 1907 行**需拆分（5类职责混在一起：常量、上传字段、受众/FAQ 字段、步骤页、装配器）。**有 790 行测试兜底，是低风险重构，但不修任何 bug，建议排在 P0 之后**。
- **`application.service.test.ts` 4560 行**应按业务能力拆分；`phase4.test.tsx`/`phase6.test.tsx` 等按开发阶段命名的测试已失去业务含义，需重切。
- **`dependency-cruiser` 的 `server-domain-does-not-use-runtime-frameworks` 规则守护了一个不存在的 `domain/` 目录**，从未真正校验过任何文件——`pnpm boundaries` 长期绿灯是假象。
- **`application.service.ts` 中 `:261` 与 `:575` 是同一条状态规则的两次独立实现**，改状态枚举必然漏改一处；建议抽`application-status.policy.ts`。
- **system 层反向依赖业务域**：`system/security/audit-export.worker.ts:3` 从 `../../application/storage.port.js` 导入，违反依赖倒置。
- **`QueryClient` 无全局默认策略**：`staleTime=0` + `refetchOnWindowFocus=true`，多 Tab 来回切每次都触发全量列表请求。
- **多处 Table `columns` 每次渲染重建**（至少 7 个文件）、`DashboardCard.tsx:2` 静态引入 echarts 未懒加载。
- **`web` 测试全局 `--dangerouslyIgnoreUnhandledErrors`**：为解决 AntD portal 环境问题而关闭了整个前端的错误检测。

---

## 四、验证结果

### 4.1 静态与单元验证

| 检查项 | 命令 | 结果 |
|---|---|---|
| 服务端类型检查 | `tsc --noEmit -p packages/server` | ✅ 通过 |
| 前端类型检查 | `tsc --noEmit -p apps/web` | ✅ 通过 |
| 全仓 lint + typecheck | `turbo run lint typecheck` | ✅ 通过 |
| 服务端全量测试 | `vitest run`（packages/server） | ✅ **54 文件 / 501 测试**通过 |
| 数据库类型检查 | `tsc --noEmit -p packages/database` | ✅ 通过 |
| 依赖边界 | `dependency-cruiser` | ✅ 零违规（663 模块） |
| 代码格式 | `prettier --check` | ✅ 已格式化 |
| jsonb 写入回归（真实 PG） | `vitest run identity-role-permissions-jsonb.real.e2e-spec.ts` | ✅ 4/4 通过（撤销修复后 4/4 失败，已验证非假绿） |

### 4.2 真实环境端到端验证（阶段二）

在真实 PostgreSQL + 真实启动的 NestJS API 上验证，而非仅靠单测：

| 验证项 | 方法 | 结果 |
|---|---|---|
| 登录失败审计落库 | 取 challenge → 构造 RSA-OAEP 加密信封 → 错误密码 POST `/login/password` | ✅ 401 `INVALID_CREDENTIALS` + `security_audit_events` 写入 `identity.login.failed` / `risk=high` |
| IP / UA / traceId 完整性 | 查库比对修复前后记录 | ✅ 修复前 `ip_address`/`user_agent`/`trace_id` 全空；修复后 `::ffff:127.0.0.1` / `e2e-audit-verify/1.0` / `01M4D2Z9C0V0QSDFWNJZNG0DJ2` |
| 权限变更审计落库 | 以 `DEMO-SUPER-ADMIN` 登录 → PATCH 自定义角色增加权限 | ✅ 200 `{"updated":true}`，审计写入 `identity.role.updated` / `risk=high`（权限提升升级）/ `details.permissionsChanged=true` |
| 角色权限实际落库 | 直查 `roles.permissions` | ✅ `["identity.department.read","identity.department.manage"]` |

### 4.3 索引效果实测（`EXPLAIN ANALYZE`）

真实表仅 21 行，两个查询均走 `Seq Scan`——**与预判一致，小表下优化器的选择是合理的**。用探针表放大数据量后：

| 数据量 | 无索引 | 有索引 | 提升 |
|---|---|---|---|
| 2 万行（超时扫描） | Seq Scan 1.512ms | Bitmap Index Scan 0.736ms | 2.1× |
| **200 万行（SLA 查询）** | Seq Scan **209.129ms**（buffers read=30770） | Index Scan **2.167ms**（buffers read=264） | **96×** |

结论：0055 迁移添加的索引在真实数据量下是必要的，当前小表上的 `Seq Scan` 不构成问题。

### 4.4 api 套件的既有失败（与本轮无关，但其中一项是安全缺陷）

`apps/api` 全量：30 文件 / 108 用例，**27 文件通过、3 文件失败、7 用例失败**。

**归属已确证**（不接受"看起来无关"就下结论）：将本轮改动的 3 个源文件全部 `git stash` 还原后单独重跑，两个失败文件**失败特征完全一致**，因此均为既有失败，与本次修复无关。

| 失败文件 | 现象 | 判定 |
|---|---|---|
| `test/portal-audience.real.e2e-spec.ts` | **6/6 全失败** | **安全缺陷，见下** |
| `test/phase5.real.e2e-spec.ts` | 1/3 失败 | 业务缺陷 |

#### ~~新发现：`portal-audience` 暴露受众隔离完全失效（安全）~~ ✅ 已修复（2026-10-09 复核）

> **本节描述的是修复前的状态，现已不成立。** 复核确认：受众隔离已实现并通过全部验收。

**原始现象**（stash 还原后同样复现，非本轮引入）：

1. **列表越权**：匿名 / 本部门 / 下级部门 / 指定跨部门员工 / 无关跨部门员工——**五种角色全部看到全部 5 条应用**（`expected 5 to deeply equal 1/2/3`）。受众过滤条件在真实数据库上完全不生效。
2. **未授权投票成功**：对未授权的受限应用投票，期望 `404`，实际返回 **`201 Created`**，且投票记录已落库（`:320`）。

**用户影响**：这是数据越权，不是可用性问题。任何登录用户都能看到全部受限应用，并可对无权访问的应用投票。

**初步定位（非本轮引入）**：全仓搜索 `audience`，服务端只命中 `analytics` 的同名字段（埋点维度）与 `portal.service.ts:778` 的 payload 结构校验；**portal 侧没有任何受众过滤实现**——`listResources` 直接查全量后返回，`findResource` 也不校验受众。因此这更可能是**功能未完成**（V1 未实现受众隔离），而非代码回归。

**但风险等同已上线越权**：测试用例（`it.each` 五种受众 + 各自期望集合）已完整写好，说明受众隔离是**已确定的需求**，只是实现缺失。攻击面当前是敞开的。

**为什么长期不可见**：`verify` 从不跑这个套件（见 P1「两个孤儿测试套件」），因此受众隔离在 CI 里没有任何护栏，实现缺失从未被拦住。

**✅ 修复现状（2026-10-09 复核）**：

新增 `packages/server/src/authorization/audience-visibility.ts`
（`audienceVisibilityCondition`），在 portal 仓储的 **6 处**读路径接入：
`listResources` / `findResource` / `listDepartments` / `getDepartment` /
`listHunt` / `voteHunt`。

复核逐条确认了原报告担心的两条攻击面都已闭合：

1. **列表与详情**：`listResources:208` 与 `findResource:278` 均带受众条件，
   且 `findResource` **不因管理权限而豁免**（受众是访问控制，
   若 owner/审核员可绕过，受众就退化成装饰）。总数查询复用同一条件，
   避免分页 total 与 items 不一致。
2. **投票**：`voteHunt:804` 的受众校验在**写库之前**——投票是写操作，
   先落库再校验即使随后抛错也已留下记录。不可见时复用 404 语义，
   不泄露「该应用存在但你无权访问」。

**额外复核的两条路径**（原报告未列出，确认安全）：
- `listComments` / `createComment` 仓储层只校验 `status='published'`，
  但服务层 `listComments:452` 先调 `findResourceById(actor, ...)`
  （app 类型走带受众过滤的 `findResource`），不可见则 404 —— 路径闭合。
- `listFavorites` 按 `employee_id` 过滤、`dashboardSummary` 只统计
  **自己拥有的**条目，均不泄露他人受限数据。

**验证**：`apps/api/test/portal-audience.real.e2e-spec.ts` **6/6 通过**
（真实 PostgreSQL，覆盖五种受众的列表/详情/聚合/活动/文件边界一致性）。

**这一条的意义超出修复本身**：它说明报告里的「未修问题」列表也会过时。
本次复核已发现 **4 处**报告与代码不符（P0-1、P1-5 未修，
P0-2 部分修复，本节受众隔离已修）。**报告的结论必须逐条回源码核实**，
与不能相信人工勾选的 ✅ 是同一个道理。

**建议**：作为**独立最高优先事项**——先明确「V1 是否要求受众隔离」。若要求，则需在 `portal.repository.ts` 的列表/详情/投票三条路径上统一实现过滤（投票必须服务端校验，客户端隐藏不构成防护）；同时把这个套件并入 `verify`，否则实现完成后仍无回归保障。

---

### 4.5 outbox 的跨时钟基准比较（2026-10-09 定位并修复）

**这是 `phase6.real.e2e-spec.ts` 长期失败的真正根因**，与本报告前述 P0/P1 无关。

**现象**：outbox 事件长期停在 `pending`、`attempts` 恒为 0，
而该事件的 SQL 条件完全满足 `claim` 的候选集 —— claim 却稳定返回空。
看起来像「偶发」，实测 3 次稳定复现（此前判断为「3 跑 2 败」是误判，
那次「成功」是诊断代码的额外 SQL 往返改变了时序）。

**根因**：claim 的候选条件是 `available_at <= now()`（**PostgreSQL 时钟**），
而写入方用**应用侧** `new Date()` 填 `available_at`。
**写入与判断分属两套时钟基准**，本机容器实测偏差约 **25 秒**（应用时钟快于 DB 时钟）：

- 应用侧看：`available_at` 已过期 ✅
- 数据库看：`available_at` 仍在未来 ⏳ → 被条件排除

后果是事件被**永久**跳过：通知永不投递，且**不产生任何错误**。

**修复**（两处缺一不可）：
1. **写入侧 9 处**统一省略 `available_at`，由数据库默认值 `now()` 生成 ——
   覆盖 notification / demand / application / feedback / interaction / portal / audit
   的 `emitOutbox`，以及 `portal-app-reconciliation-runner`。
2. **claim 侧**改用 `clock_timestamp()`（真实当前时间），
   避免同一事务内 `now()` 固定在事务开始时刻。

**这类缺陷的特征**：跨进程/跨层的**时间基准不一致**不会被编译器、
类型检查或任何单测发现；只有真实数据库 + 真实时钟才暴露。
排查这类问题**靠测量而非推理** —— 决定性证据是同时打印两侧时钟偏差：

```
skewMs: 25272          ← 应用时钟比数据库快 25.27 秒
pendingAvail: -101     ← 该事件的 available_at 比「当前应用时刻」早 101ms
```

`pendingAvail < 0`（应用侧看已过期）与 `skewMs > 0`（数据库侧看未过期）
同时成立，即为死锁式矛盾。

**验证**：phase6 连续 3 次全通过；**反向验证**（把写入侧改回应用侧时钟）
后 phase6 如期失败，确认门禁真正覆盖了该缺陷。

---

## 五、建议的后续顺序

1. ~~**本迭代收尾**：应用 0055 索引 + EXPLAIN ANALYZE 确认~~ ✅ 已完成（见 P1-4）
2. ~~**下一迭代优先**：安全审计补齐 → outbox 超时与心跳 → 指标 route 归一化~~ ✅ 已完成（三项均落地并经真实环境验证；期间额外发现并修复 P0-6、P1-6）
3. ~~**下一批**：分页下推 SQL、CSV 导入批量化、接入孤儿测试套件~~ ✅ 已完成（2026-10-09）
   > 顺序按 P0-6 的教训调整过：先接入孤儿套件，再做分页/CSV 改造 ——
   > 正是 `test:api-data` 暴露了通知授权、停用角色越权、附件 fail-open、clamd 协议这 4 个缺陷。
   > 该套件现已进入 `verify`（CI 已配 postgres service），13 文件 / 48 测试全绿。
4. **补修不实的 ✅ 标记（2026-10-09 复核发现）**：
   - ~~**P0-1 连接池**：补 `pool.on("error")` + 池参数外部化~~ ✅ **已修复**
   - ~~**P1-5 冲突语义**：让 `DEMAND_CONFLICT` 映射到 409~~ ✅ **已修复**
     （顺带发现并修正了根因：7 个 controller 各写一份错误码映射清单，
     现已收敛为 `system/http/domain-error.ts` 单一来源）
   - **P0-2 应用层 CAS**：`completeReviewQueue` 补 `.where("status","=","available")`，
     并把状态检查移入事务。数据库唯一约束只是最后一道防线，
     靠约束兜底会把并发冲突变成**数据库异常**而非可控的业务拒绝
     （与 P1-5 同源：冲突信号没能正确传达给客户端）。
5. ~~**受众隔离（第四节）**~~ ✅ **已修复**（2026-10-09 复核确认）。
   原报告称「任何登录用户可看到全部受限应用并投票」，现已有
   `audience-visibility.ts` 并在 6 处读路径接入，`portal-audience.real.e2e-spec.ts` 6/6 通过。
   > **这一条的意义超出修复本身**：它说明报告里的「未修问题」列表同样会过时。
   > 本次复核已发现 **4 处**报告与代码不符。**报告的结论必须逐条回源码核实** ——
   > 与不能相信人工勾选的 ✅ 是同一个道理。

6. ~~**唯一遗留未修**：`phase6.real.e2e-spec.ts` 偶发失败~~ ✅ **已修复（2026-10-09）**
   —— 根因是 **outbox 的跨时钟基准比较**（详见 §4.3），与本报告的 P0/P1 条目无关。

7. **结构性重构单独排期**：`steps.tsx`（1987 行）拆分、
   `application.service.test.ts`（4541 行）拆分、测试治理脚本扩展。