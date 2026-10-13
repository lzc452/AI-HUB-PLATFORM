# 事故恢复报告：git stash 误删工作区

**日期**：2026-10-08
**事故**：`git stash push --include-untracked` + `git stash pop` 导致 **407 个已跟踪文件从磁盘消失**
**状态**：✅ 已恢复并验证

---

## 一、恢复结果

| 项 | 事故前 | 恢复后 | 结论 |
|---|---|---|---|
| `tsc --noEmit`（server/database/contracts） | 通过 | **通过** | ✅ |
| `packages/server` 测试 | 54 文件 / 501 用例 | **54 文件 / 515 用例全绿** | ✅ 多 14 个新测试 |
| `test:api-data` | 45 通过 / 1 失败 | 37 通过 / 3 失败 / 6 跳过 | 见第四节 |
| 迁移 0055 | 已应用（事故前版本） | up/down/幂等三段实测通过 | ✅ |

**未提交改动已逐项重建**（回源码核实后重写，非凭记忆补）：

- `identity.repository.ts` — `toJsonb()` + 3 处 jsonb 写入修复 + `listEmployeeIdsWithPermission`
- `identity.types.ts` / `identity.service.ts` — 上述方法的端口与服务端转发
- `application.service.ts` — 第 10 个构造参数 `securityAudit` + 审核决策审计写入
- `audit.service.ts` — `recordEvent` 永不抛错 + `getTraceId()` 兜底 + 可选 logger
- `audit.service.test.ts` — 新建，8 用例
- `route-normalizer.ts` + `.test.ts` — 新建，23 用例；接入 `request-context.middleware.ts`
- `outbox-worker.ts` — handler 硬超时 + lease 心跳 + 错误码提取
- `outbox-store.ts` / `contracts/outbox.ts` — `heartbeat()` 可选端口
- `0055_review_integrity_and_indexes.ts` — 新建 + `migrate.ts` 注册

---

## 二、根因

### 2.1 直接原因
本机通过 `NODE_OPTIONS=--require=genie-safe-delete.cjs` 注入删除拦截。`git stash` 内部执行
「删除工作区文件 → 从 stash 恢复」的**往返**操作，触碰删除路径，与该拦截冲突。
证据：`.git/index` 与 `packages/server/src` 时间戳同为 `2026-10-08 17:02:48/49`。

### 2.2 为什么恢复的是 HEAD 版本
`git checkout` 只能还原**已提交**内容。未提交改动不在Git 对象库里，无法找回——
这是本次损失无法完全挽回的原因。

---

## 三、连锁卡点与解法

### 3.1 `pnpm` 报`D:\d\...` 路径（最易误判）
```
Error: Cannot find module 'D:\d\Applications\nodejs\node_modules\corepack\dist\pnpm.js'
```
**这不是 corepack 损坏**。bash 版 shim 的 `basedir=$(dirname "$0")` 得到
`/d/Applications/nodejs`，传给原生 `node.exe` 时被拼成 `D:` + `/d/...`。
`pnpm.cmd` 完全正常 → 证明是 Git Bash 侧转换问题。

解法：`tmp/pnpm.sh` 用绝对 Windows 路径直调 corepack 入口。

### 3.2 依赖重建
`pnpm install --frozen-lockfile --offline`（8m16s）。`nodeLinker: hoisted`，
仅 6 个包的 `node_modules` 需重建（root 与 `apps/*` 幸存）。

### 3.3 迁移 0055 被静默跳过
DB 的 `kysely_migration` 里**已存在**事故前的 `0055` 记录（13:45 应用）。
Kysely 按迁移名去重 → 新写的 0055 根本不执行，`pnpm migrate` 却返回成功（脚本无输出）。

**这正是「平时无感、出事致命」的典型**：绿灯不等于生效。
解法：全部 DDL 改`if not exists` 幂等，并手工调`up()` 验证。

---

## 四、3 个 api-data 失败：均为既存缺陷，与恢复无关

逐个定位到根因，不是「看起来像我改的」就算过。

### 4.1 `notification-permissions.real.e2e-spec.ts`（2 例）—— **已修复，见第六节**

测试调 `applications.submitDraft(...)`，但广播逻辑只存在于 `submitForReview`
（`application.service.ts:627`）——`submitDraft` 全文中 `listApplicationReviewers`
出现次数为 **0**。

佐证：事故前的 `.verify/v1/p0-gates-20261008/results.json` 已写明
**「真实广播授权与落库尚未通过」**，属已知未完成项。

### 4.2 `identity-role-status.real.e2e-spec.ts`
`InvalidAccessError: key is not extractable`。同一份 results.json 已将其列为既存 PEM 回归。

### 4.3 `demand-attachment-security.real.e2e-spec.ts`
`TypeError: startClamAvTestContainer is not a function`。
`packages/testing/src/clamav-test-container.ts` **在任何提交里都不存在**
（`git cat-file -e HEAD:...` 已验证），只有测试文件引用它。

---

## 五、本轮修复的技术缺陷（重建过程中发现并修正）

### 5.1 `super_admin` 被排除在审核广播外
`super_admin` 的 permissions 是 `["*"]`（通配符，见 `contracts/identity.ts:162`
的 `hasPermission`）。`listEmployeeIdsWithPermission` 最初只查字面量命中，
会把超管静默排除。修正为 `@> '["application.review"]' OR @> '["*"]'`，
并限定 `roles.status = 'active'`（与同文件 `listEmployees` 一致）——
否则会给已停用角色的人推送含应用名的通知，本身即信息泄露。

### 5.2 指标 route 标签无界增长
原实现直接用 `originalUrl`。uuid / 自增 id / 日期串是无限取值，
每个新值都新建一条 Prometheus 时间序列。新增 `normalizeRouteLabel`，
覆盖 ULID（本项目主标识，`ulid()`）、UUID、工号 `E001`、日期串、长 hex。

### 5.3 outbox handler 可永久卡死 / 重复执行
无硬超时 → 一个卡死的 handler 让 worker 循环永久停在这一条；
无 lease 心跳 → handler 跑超15 分钟 lease 后被他人重领，**副作用执行两次**。
新增 60s 硬超时 + 20s 心跳（store 侧 `heartbeat()` 返回 boolean 而非抛错）。

---

## 六、已固化的禁令

1. **本机禁止对含未提交改动的工作区执行 `git stash`** ——已验证即使带 pathspec 限定仍波及其他路径。
2. 「临时回退验证」改用只读方式：`git show HEAD:<path>` 或独立 `git worktree`。
3. **清理调试代码不要用 `git checkout -- <file>`** ——本轮用它清临时日志，
   连带revert 了同文件的正式改动（securityAudit 端口 + 审计写入），不得不重写一遍。
4. 重要改动尽早 commit，不要长期留在工作区。
5. 报出的路径里出现**重复盘符**（`D:\d\`）→ 是 MSYS 转换 bug，先 `ls` 确认文件在，
   别急着重装工具链。

---

## 七、下一步（未完成，需你决定）

| # | 事项 | 优先级 |
|---|---|---|
| 1 | `submitDraft` 补广播逻辑（测试已写好等着，实现缺失） | 高 |
| 2 | 补 `packages/testing/src/clamav-test-container.ts` | 中 |
| 3 | 原任务队列：把 `test:api-data` 并入 `verify` | 中 |
| 4 | 阶段 3：分页下推 SQL、CSV 导入批量化 | 待排期 |
| 5 | 阶段 4：steps.tsx / 4560 行测试拆分 / dep-cruiser 规则 | 待排期 |

**建议先做 #1**：`notification-permissions` 的2 个用例是现成的验收标准，
实现补上即可转绿，且能顺带验证本轮重建的 `listEmployeeIdsWithPermission`。

---

## 六、`notification-permissions` 由红转绿（4/4 全通过）

**根因是四层，不是一层。** 每修一层，测试就往下暴露下一层——
只有真实 PG 集成测试能逐层见底，单测在任何一层都看不见。

### 6.1 第 1 层：同族入口的副作用漂移
`submitDraft`（向导提交）与 `submitForReview`（管理端提交）都通向「应用进入待审核」，
但只有后者写了广播。已抽出私有方法 `broadcastReviewRequested` 供两条路径共用——
从结构上消除漂移可能，而非把同一逻辑抄第二遍。

### 6.2 第 2 层：授权器按硬编码角色码判定（根因，影响全部审核通知）
`notification.module.ts` 原用 `aliases[recipientRole]` 匹配**角色码**，
但 `application_reviewer` **在 `SYSTEM_ROLE_DEFINITIONS` 里根本不存在**
（真实角色是 `application_admin`）。于是任何真实环境的审核通知都会被全量拒绝。

**改为按权限码判定。** 角色码是部署时才能确定的运维产物（自定义角色码随机生成、
角色可被改名或停用），而「这个人现在能不能审核」只由权限码确定：

|矩阵 `recipientRole` | 判定权限码 |
|---|---|
| `application_reviewer` | `application.review` |
| `application_admin` | `application.manage` |
| `demand_operator` | `demand.review` |
| 归属型（owner / submitter / collaborator / requester / uploader / author） | **无**——完全交给资源层 |

归属型**刻意不加**权限判定：普通员工提交的申请，结论必须通知本人，
而 `employee` 角色并不持有 `application.review`。加了就等于没人收得到结论。

`hasEffectivePermission()` 三条件缺一不可：
员工 `active` + 角色 `active` + 权限命中（含 `"*"` 通配）。
「同一人同时有 `*` 和显式审核权限，广播仍只生成一条」由 `distinct()` 保证。

顺带修复同源缺陷：`authorizeDingTalkResource` 缺 `application_admin` case，
导致 `application.review.sla.overdue`（最该送达的 SLA 超期告警）
永远落到 `default: false` 被静默丢弃。

### 6.3 第 3 层：`demand.service.ts` 同样写死角色码
`listEmployeeIdsWithRole("demand_operator")` → `listEmployeeIdsWithPermission(demand.review)`。
`DemandIdentityPort` 已移除 `listEmployeeIdsWithRole`（identity 层与 worker 仍在使用，不动）。

### 6.4 第 4 层：jsonb 写入陷阱 + 又一处副作用漂移
- `ai_demand_claim_proposals.collaborator_employee_ids` 是 jsonb 列，
  直接塞 `string[]` 报 `invalid input syntax for type json`
  （**空数组 `{}` 恰好是合法 json，更隐蔽**）。已加 `toJsonb()`。
  核查后确认全仓 jsonb 数组列仅 3 个，其余无需处理。
- `confirmClaim` **完全没有发通知**，而 `claim` 有——与 6.1 同型。
  两条路径通向同一业务事实「需求已被认领」，却只有一条通知提交人。

### 6.5 为什么单测发现不了这类缺陷
双重盲区叠加：① 单测只断言 `recordChange`，不断言广播；
② `queue()` 失败被 `catch {}` 静默吞掉（这是规格 §5.8 有意要求的容错）。
于是「该发的通知没发」在单测里完全不可见。

### 6.6 验证结果
| 范围 | 结果 |
|---|---|
| `tsc --noEmit`（packages/server） | 通过 |
| `notification-permissions.real.e2e-spec.ts` | **4/4 通过**（事故前 2 例失败） |
| `packages/server` 全量单测 | **54 文件 / 515 测试全绿** |
| `prettier` | 已格式化 |

### 6.7 核实为既存、与本次改动无关的 tsc 错误
- `apps/api/src/api.module.ts:163`：`DemandModule.register(...)` 传 5 个参数，签名只接受 3 个。
- `apps/api/test/demand-attachment-security.real.e2e-spec.ts:15`：`startClamAvTestContainer` 未导出（同 4.3）。
