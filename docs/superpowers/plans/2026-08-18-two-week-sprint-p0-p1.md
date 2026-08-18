# 两周冲刺实施计划 — PRD2APP 报告 P0/P1 整改

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在两周（Sprint 1 = P0 + 审核核心，Sprint 2 = P1 其余）内关闭 PRD2APP.md §9 的 P0×5 与 P1 大部分缺口，使 V1 达到可进入 Phase 8（试点）的状态。

**Architecture:** 全部整改基于现有模块化单体：服务层改在 `packages/server/src/<domain>`，HTTP 入口在 `apps/api`，定时任务按 `apps/worker/src/main.ts:106-131` 的 `createRetentionRunner + setInterval` 模式新增。新表一律用新编号 migration（0040 起），不重编号既有迁移。前端改动仅限报告标记的前端缺口。

**Tech Stack:** TypeScript、NestJS 11、Kysely、Vitest、Testcontainers、React 19 + AntD 6 + TanStack Query。

## Global Constraints

- 单企业单实例、无 `tenant_id`；600 员工上限。
- 新增 V1 功能须有对应测试；每个任务独立提交，Conventional Commit。
- 迁移命名不可变：本计划所有新表用 0040+ 新迁移文件，禁止修改已应用迁移（0001–0039）。
- 授权必须在后端执行；前端仅改善体验。
- 接口错误使用 ProblemDetails（`type/title/status/code/detail/traceId/fieldErrors`）。
- 时间统一 UTC；界面简体中文。
- 不在 V1 引入 Redis/消息队列/Elasticsearch/K8s；搜索用 PostgreSQL。
- 验证命令：`corepack pnpm verify`、`corepack pnpm --filter @ai-hub/api test`、`docker exec ai-hub-platform-postgres-1 psql -U ai_hub -d ai_hub -c "select name from kysely_migration order by timestamp;"`（迁移核查）。

---

## 文件结构

本计划新增/修改的文件与责任：

| 文件 | 责任 | 涉及任务 |
|---|---|---|
| `packages/server/src/system/security/rate-limit.middleware.ts`（新） | 进程内滑动窗口限流 | T1 |
| `packages/server/src/system/security/rate-limit.middleware.test.ts`（新） | 限流单测 | T1 |
| `apps/api/src/main.ts` | 注册限流中间件 | T1 |
| `packages/database/src/migrations/0040_application_likes_id.ts`（新） | `application_likes` 加 `like_id` 主键 | T2 |
| `packages/server/src/interaction/interaction.types.ts` | `addLike` 返回类型变更 | T2 |
| `packages/server/src/interaction/interaction.repository.ts` | `addLike` RETURNING `like_id` | T2 |
| `packages/server/src/interaction/interaction.service.ts` | like 幂等键改 `like_id` | T2 |
| `packages/server/src/notification/dingtalk-matrix.service.ts` | 矩阵键与事件名对齐、收件人修正 | T3 |
| `packages/server/src/system/outbox/sla-reminder.worker.ts`（新） | 审核 SLA 扫描 + 24h/48h 提醒 | T4, T18 |
| `packages/server/src/application/application.service.ts` | 并发版本上限、撤回、自动上架、自审、原因必填 | T5–T7 |
| `packages/server/src/application/application.repository.ts` | 校验报告写入、pending 检查、恢复查询 | T5, T8 |
| `apps/api/test/application.e2e-spec.ts` / `.real.e2e-spec.ts` | 审核闭环 e2e | T5–T7 |
| `packages/server/src/application/validation-report.service.ts`（新） | 校验报告组装 | T8 |
| `packages/server/src/application/artifact-verification.worker.ts` | 未签名标记 | T9 |
| `packages/database/src/migrations/0041_artifact_signed.ts`（新） | `artifact_uploads.signed` 列 | T9 |
| `packages/server/src/system/security/web-url-policy.ts`（新） | 内网 URL 白名单校验 | T11, T19 |
| `packages/config/src/*` | `webTargetAllowlist` 配置 | T11 |
| `packages/contracts/src/application.ts` | 交付目标元数据（OS/平台/小程序渠道） | T12 |
| `packages/database/src/migrations/0042_delivery_targets.ts`（新） | 交付目标表 | T12 |
| `packages/server/src/application/qr-code-validator.ts`（新） | 二维码解析 + 格式校验 | T12 |
| `packages/database/src/migrations/0043_search_trgm.ts`（新） | pg_trgm 扩展 + gin 索引 | T13 |
| `packages/server/src/catalog/catalog.repository.ts` | 搜索评分排序 | T13 |
| `packages/server/src/analytics/dashboard-metrics.ts` | 需求价值看板 + 首屏 KPI | T15 |
| `packages/server/src/analytics/dashboard.service.ts` | 单应用筛选 | T15 |
| `packages/server/src/analytics/aggregation.service.ts` | 新指标聚合、部门小样本、匿名排除 | T15, T16 |
| `apps/worker/src/*` | AnalyticsExportWorker | T17 |
| `packages/server/src/demand/demand.service.ts` | 转化校验 + SLA | T18 |
| `packages/database/src/migrations/0044_demand_review_sla.ts`（新） | `demands.sla_due_at` | T18 |
| `packages/server/src/application/health-check.worker.ts`（新） | Web URL 健康检查 | T19 |
| `packages/server/src/catalog/catalog.controller.ts` | 可信标签/废弃写接口 | T19 |
| `packages/server/src/identity/identity.service.ts` | 部门删除迁移、角色撤销会话 | T20 |
| `packages/server/src/identity/identity.controller.ts` | Cookie Secure | T20 |

---

## Sprint 0 — 前置收尾（0.5 天）

### Task 0: 提交迁移重命名与 migrate.ts

**Files:**
- Modify（已 staged）: `packages/database/src/migrate.ts`
- Modify（已 staged）: `packages/database/src/migrations/0038_employee_application_publish.ts`（rename from 0039）、`0039_application_published_review_state.ts`（rename from 0038）

**Interfaces:**
- Consumes: 无
- Produces: 无（纯仓库状态修正）

- [ ] **Step 1: 核对暂存内容**

```bash
git status --short packages/database/
# 期望：migrate.ts(M) + 两个 R 重命名，三者同批
```

- [ ] **Step 2: 提交**

```bash
git commit -m "fix: renumber applied migrations 0038/0039 to match kysely_migration records"
```

- [ ] **Step 3: 验证迁移仍无待应用**

```bash
corepack pnpm migrate && docker exec ai-hub-platform-postgres-1 psql -U ai_hub -d ai_hub -t -c "select name from kysely_migration order by timestamp;" | tail -3
# 期望：0038_employee_application_publish、0039_application_published_review_state 在列
```

---

## Sprint 1 — P0 + 审核核心（第 1 周）

### Task 1: 登录与 API 限流（P0-1）

**Files:**
- Create: `packages/server/src/system/security/rate-limit.middleware.ts`
- Create: `packages/server/src/system/security/rate-limit.middleware.test.ts`
- Modify: `apps/api/src/main.ts`（在 `createIdentityCookieBridge()` 之后注册）

**Interfaces:**
- Consumes: 无
- Produces: `createRateLimitMiddleware(options: { limits: ReadonlyArray<{ matcher: (path: string) => boolean; windowMs: number; max: number; keySource: "ip" | "ip+account" }>; now?: () => number })` → 返回 `(req, res, next)` 中间件

- [ ] **Step 1: 写失败测试**

```ts
// rate-limit.middleware.test.ts
import { describe, it, expect } from "vitest";
import { createRateLimitMiddleware } from "./rate-limit.middleware.js";

function callMw(mw: (req: any, res: any, next: () => void) => void, path: string, ip: string) {
  const req = { path, ip, headers: {} } as any;
  let status = 0, json: unknown = null, nexted = false;
  const res = { status: (s: number) => { status = s; return { json: (j: unknown) => { json = j; } }; } } as any;
  mw(req, res, () => { nexted = true; });
  return { status, json, nexted };
}

describe("rate limit middleware", () => {
  it("blocks the 6th login attempt within a minute from the same IP", () => {
    const mw = createRateLimitMiddleware({
      limits: [{ matcher: (p) => p === "/internal/login/password", windowMs: 60_000, max: 5, keySource: "ip" }],
    });
    for (let i = 0; i < 5; i++) {
      const r = callMw(mw, "/internal/login/password", "10.0.0.1");
      expect(r.nexted).toBe(true);
    }
    const blocked = callMw(mw, "/internal/login/password", "10.0.0.1");
    expect(blocked.nexted).toBe(false);
    expect(blocked.status).toBe(429);
  });

  it("counts accounts separately from IPs", () => {
    const mw = createRateLimitMiddleware({
      limits: [
        { matcher: (p) => p === "/internal/login/password", windowMs: 60_000, max: 2, keySource: "ip" },
        { matcher: (p) => p === "/internal/login/password", windowMs: 60_000, max: 3, keySource: "ip+account" },
      ],
    });
    // 3 个不同账号、同一 IP 各 2 次 → 第 3 个账号第 2 次仍放行（IP 2 次/分）
    for (let i = 0; i < 2; i++) {
      for (const acc of ["a", "b", "c"]) {
        const req = { path: "/internal/login/password", ip: "10.0.0.1", headers: {}, body: { employeeNumber: acc } } as any;
        // 通过 body 提取账号
        const r = callMw(mw, "/internal/login/password", "10.0.0.1");
        expect(r.nexted).toBe(true);
      }
    }
    // 同一账号第 4 次 → 429
    const blocked = callMw(mw, "/internal/login/password", "10.0.0.1");
    expect(blocked.status).toBe(429);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test rate-limit`
Expected: FAIL — `Cannot find module './rate-limit.middleware.js'`

- [ ] **Step 3: 实现中间件**

```ts
// rate-limit.middleware.ts
export interface RateLimitRule {
  matcher: (path: string) => boolean;
  windowMs: number;
  max: number;
  keySource: "ip" | "ip+account";
}

interface RateLimitOptions {
  limits: ReadonlyArray<RateLimitRule>;
  now?: () => number;
}

/** 进程内滑动窗口限流。模块化单体单实例时有效；双机部署按实例计数（V1 可接受）。 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const accountBucketKey = (req: unknown): string => {
    const body = (req as { body?: unknown }).body;
    if (typeof body === "object" && body !== null) {
      const employeeNumber = (body as { employeeNumber?: unknown }).employeeNumber;
      if (typeof employeeNumber === "string") return employeeNumber;
    }
    return "unknown";
  };
  return (req: unknown, res: unknown, next: () => void) => {
    const request = req as { path: string; ip: string };
    const response = res as {
      status: (code: number) => { json: (body: unknown) => void };
    };
    for (const rule of options.limits) {
      if (!rule.matcher(request.path)) continue;
      const ipKey = `ip:${request.ip}`;
      const key =
        rule.keySource === "ip+account"
          ? `account:${accountBucketKey(req)}`
          : ipKey;
      const nowMs = now();
      const bucket = buckets.get(key);
      if (bucket === undefined || bucket.resetAt <= nowMs) {
        buckets.set(key, { count: 1, resetAt: nowMs + rule.windowMs });
      } else {
        bucket.count += 1;
        if (bucket.count > rule.max) {
          response.status(429).json({
            type: "https://ai-hub.local/problems/rate-limit",
            title: "请求过于频繁",
            status: 429,
            code: "RATE_LIMITED",
            detail: "请稍后重试",
            traceId: "",
          });
          return;
        }
      }
    }
    next();
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `corepack pnpm --filter @ai-hub/server test rate-limit`
Expected: PASS

- [ ] **Step 5: 注册到 API**

在 `apps/api/src/main.ts` 的 `app.use(createIdentityCookieBridge());`（:118）之后插入：

```ts
app.use(
  createRateLimitMiddleware({
    limits: [
      // 登录端点：固定频率限制（规格 §5.1 要求的最低限度）
      { matcher: (p) => p === "/internal/login/password", windowMs: 60_000, max: 5, keySource: "ip" },
      { matcher: (p) => p === "/internal/login/challenge", windowMs: 60_000, max: 10, keySource: "ip" },
      { matcher: (p) => p === "/internal/login/challenge", windowMs: 60_000, max: 20, keySource: "ip+account" },
    ],
  }),
);
```

- [ ] **Step 6: e2e 验证登录限流**

在 `apps/api/test/identity.e2e-spec.ts` 增加：连续 6 次 `POST /internal/login/password`（错误密码）→ 第 6 次返回 `429` + `code: "RATE_LIMITED"`。注意 mock 仓库测试下路径匹配仍然生效。

- [ ] **Step 7: 提交**

```bash
git add packages/server/src/system/security/rate-limit.middleware.ts packages/server/src/system/security/rate-limit.middleware.test.ts apps/api/src/main.ts apps/api/test/identity.e2e-spec.ts
git commit -m "feat(security): add fixed-rate login rate limiting"
```

---

### Task 2: 互动 like 幂等键修复（P0-2）

**Files:**
- Create: `packages/database/src/migrations/0040_application_likes_id.ts`
- Modify: `packages/database/src/migrate.ts`（注册 0040）
- Modify: `packages/server/src/interaction/interaction.types.ts`（`addLike` 签名）
- Modify: `packages/server/src/interaction/interaction.repository.ts:64-72`
- Modify: `packages/server/src/interaction/interaction.service.ts:39-47`
- Test: `packages/server/src/interaction/interaction.service.test.ts`

**Interfaces:**
- Consumes: `InteractionRepository.addLike(applicationId, employeeId): Promise<void>`（现状）
- Produces: `addLike(applicationId, employeeId): Promise<string>`（返回 `like_id`）；`toggleLike` 行为事件幂等键 `application-liked:${likeId}`

- [ ] **Step 1: 写失败测试（迁移 + 服务）**

```ts
// interaction.service.test.ts 内新增
it("uses a stable idempotency key derived from the like row id", async () => {
  // MemoryInteractionRepository.addLike 返回 `like-${applicationId}-${employeeId}`
  const recorded: string[] = [];
  const service = new InteractionService(
    repo,
    authorization,
    visibility,
    { record: async (_actor, input) => { recorded.push(input.idempotencyKey); return { inserted: true }; } },
  );
  await service.toggleLike(actor, "app-1");
  expect(recorded[0]).toBe("application-liked:like-app-1-DEMO-EMPLOYEE");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test interaction`
Expected: FAIL — `addLike` 返回 `void`，键包含 `Date.now()`

- [ ] **Step 3: 迁移 0040 加 like_id 主键**

```ts
// 0040_application_likes_id.ts
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_likes
    add column like_id bigserial primary key
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_likes
    drop column if exists like_id
  `.execute(db);
}
```

在 `packages/database/src/migrate.ts` 注册 `"0040_application_likes_id"`。

- [ ] **Step 4: 修改仓库与接口**

`interaction.types.ts`：

```ts
addLike(applicationId: string, employeeId: string): Promise<string>;
```

`interaction.repository.ts:64-72`：

```ts
async addLike(applicationId: string, employeeId: string): Promise<string> {
  const row = await this.db
    .insertInto("application_likes")
    .values({ application_id: applicationId, employee_id: employeeId })
    .onConflict((oc) =>
      oc.columns(["application_id", "employee_id"]).doNothing(),
    )
    .returning("like_id")
    .executeTakeFirst();
  return row === undefined
    ? `like-${applicationId}-${employeeId}` // 并发冲突时无新行，退化为稳定键
    : String(row.like_id);
}
```

`interaction.service.ts` `toggleLike` 内（原 :39-47）：

```ts
if (!liked) {
  const likeId = await repository.addLike(applicationId, actor.employeeId);
  await this.analyticsEvents?.record(actor, {
    eventName: "application_liked",
    aggregateType: "application",
    aggregateId: applicationId,
    occurredAt: new Date().toISOString(),
    idempotencyKey: `application-liked:${likeId}`,
    metadata: { source: "interaction.like" },
  });
}
```

同时删除原 `addLike` 调用点（`toggleLike` 内 `else await repository.addLike(...)` 前的旧调用），保持事务内调用顺序：先 `hasLike` → `removeLike` 或 `addLike`（返回值仅在新增分支使用）。

- [ ] **Step 5: 运行测试确认通过 + 迁移验证**

Run: `corepack pnpm --filter @ai-hub/server test interaction && corepack pnpm migrate`
Expected: PASS；`kysely_migration` 尾部出现 `0040_application_likes_id`

- [ ] **Step 6: 提交**

```bash
git add packages/database/src/migrations/0040_application_likes_id.ts packages/database/src/migrate.ts packages/server/src/interaction/
git commit -m "fix(interaction): derive like analytics idempotency key from like row id"
```

---

### Task 3: 通知矩阵键对齐（P0-3）

**Files:**
- Modify: `packages/server/src/notification/dingtalk-matrix.service.ts`
- Modify: `packages/server/src/notification/dingtalk-matrix.service.test.ts`（若存在）
- Modify: `packages/server/src/demand/demand.service.ts`（`demand.submitted` 调用点收件人）
- Test: `apps/api/test/phase5.real.e2e-spec.ts`（或对应 demand e2e）

**Interfaces:**
- Consumes: `emitOutbox` 事件名（`application.review.requested`、`application.review.decided`、`artifact.verification.failed`、`demand.reviewed` 等，见各 service 调用点）
- Produces: 矩阵键与事件名一致；`demand.submitted` 收件人改为创新运营管理员

- [ ] **Step 1: 写失败测试（矩阵键一致性）**

```ts
// dingtalk-matrix.service.test.ts（若不存在则新建）
import { DINGTALK_NOTIFICATION_MATRIX } from "./dingtalk-matrix.service.js";

const EMITTED_EVENTS = [
  "application.review.requested",
  "application.review.decided",
  "application.published",
  "application.withdrawn",
  "artifact.verification.failed",
  "demand.submitted",
  "demand.reviewed",
  "demand.claimed",
  "demand.collaborator_assigned",
  "demand.progress_updated",
  "demand.pilot_started",
  "demand.closed",
  "demand.merged",
  "analytics.export.completed",
  "analytics.export.failed",
  "analytics.assistant.failed",
];

it("matrix keys match emitted outbox event names", () => {
  for (const event of EMITTED_EVENTS) {
    expect(DINGTALK_NOTIFICATION_MATRIX).toHaveProperty(event);
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test dingtalk-matrix`
Expected: FAIL — `application.review.requested` 不在矩阵（矩阵键是 `application.review_requested`）

- [ ] **Step 3: 对齐矩阵键**

将 `dingtalk-matrix.service.ts` 中以下键改为点分命名，与 `emitOutbox` 事件名一致：

| 现状键 | 改为 |
|---|---|
| `application.review_requested` | `application.review.requested`（模板改为 "应用 {aggregateId} 已提交评审，待领取。"） |
| `application.review_decided` | `application.review.decided` |
| `application.published` / `application.withdrawn` | 保持不变（已匹配） |
| `demand.submitted` | 保留键，收件人逻辑修正（见 Step 4） |
| 新增 | `demand.reviewed`：`recipientRole: "demand_submitter"`，模板 "需求 {aggregateId} 的审核结论：{decision}。" |
| 新增 | `artifact.verification.failed`：`recipientRole: "artifact_uploader"`，模板 "安装包 {aggregateId} 校验失败：{errorCode}。" |
| 新增 | `application.review.claim_expired`：`recipientRole: "application_reviewer"`，模板 "评审任务 {aggregateId} 已超时释放。"（供 T4 使用） |

- [ ] **Step 4: 修正 `demand.submitted` 收件人**

找到 `demand.service.ts` 中调用 `queue(actor, "demand.submitted", ...)` 的位置（提交后通知）：当前传 `recipientEmployeeId: actor.employeeId`（提交人）。规格要求"新需求待审"通知审核人。改为通知**任一创新运营管理员**：通过注入的 `IdentityRepository`（在 demand 模块构造函数新增可选端口）查询 `demand_operator`/`DEMAND_REVIEW` 权限成员列表，取第一个作为收件人；列表为空则跳过（`NOTIFICATION_RECIPIENT_REQUIRED` 需容忍——改为 `if (reviewers.length === 0) return;`）。

```ts
// demand.service.ts 提交成功后
const reviewers = await this.identityPort?.listEmployeeIdsWithRole("demand_operator") ?? [];
if (reviewers.length > 0) {
  await this.notifications.queue(actor, "demand.submitted", {
    recipientEmployeeId: reviewers[0]!,
    aggregateId: demandId,
  });
}
```

`listEmployeeIdsWithRole(roleCode: string): Promise<string[]>` 为 identity 模块新增端口（`identity.types.ts` 定义接口 + `identity.repository.ts` 实现：`select employee_id from employee_roles join roles on ... where role_code = $1`）。demand 模块通过构造注入；`forTest` 装配提供内存实现。

- [ ] **Step 5: 运行测试确认通过**

Run: `corepack pnpm --filter @ai-hub/server test dingtalk-matrix demand`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/server/src/notification/ packages/server/src/demand/ packages/server/src/identity/
git commit -m "fix(notification): align dingtalk matrix keys with emitted events and fix demand review recipients"
```

---

### Task 4: 审核 SLA 2 个工作日 + 24h/48h 提醒（P1-6a）

**Files:**
- Create: `packages/server/src/system/outbox/sla-reminder.worker.ts`
- Create: `packages/server/src/system/outbox/sla-reminder.worker.test.ts`
- Modify: `packages/server/src/application/application.service.ts:275,392`（SLA 计算）
- Modify: `apps/worker/src/main.ts`（注册定时任务）
- Modify: `packages/database/src/outbox/outbox-store.ts` 或直接复用现有 append

**Interfaces:**
- Consumes: `createReviewQueue({ slaDueAt })`（application.service 两处：:275 与 :392）；outbox `append({ eventType, aggregateType, aggregateId, payload, idempotencyKey })`
- Produces: `createSlaReminderRunner({ applicationRepo, demandRepo?, identityRepo, notifications, now? })` → `() => Promise<void>`（供 `setInterval` 调用）

- [ ] **Step 1: 写失败测试（工作日计算）**

```ts
// sla-reminder.worker.test.ts
import { addBusinessDays } from "./sla-reminder.worker.js";

it("adds two business days skipping weekends", () => {
  // 2026-08-14 是周五
  expect(addBusinessDays(new Date("2026-08-14T10:00:00Z"), 2).toISOString()).toBe("2026-08-18T10:00:00Z");
  // 周四 + 2 = 周一
  expect(addBusinessDays(new Date("2026-08-13T10:00:00Z"), 2).toISOString()).toBe("2026-08-17T10:00:00Z");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test sla-reminder`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 SLA 计算与提醒任务**

```ts
// sla-reminder.worker.ts
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export interface SlaReminderDeps {
  listExpiredReviews: (now: Date) => Promise<Array<{ applicationVersionId: string; claimedByEmployeeId: string | null; ownerEmployeeId: string; name: string }>>;
  listApplicationAdmins: () => Promise<string[]>;
  createNotification: (input: { recipientEmployeeId: string; eventType: string; aggregateId: string; message: string; metadata?: Record<string, unknown> }) => Promise<void>;
  emitOutbox: (input: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; idempotencyKey: string }) => Promise<void>;
  now?: () => Date;
}

/**
 * 规则（规格 §5.5）：
 * - 领取后超过 24h 未结论 → 提醒领取人（站内通知）。
 * - 领取后超过 48h 未结论（或领取超时释放后仍超 SLA）→ 通知全部应用管理员 + 超级管理员。
 * 只发提醒，不自动审批。每次提醒用幂等键，避免重复。
 */
export function createSlaReminderRunner(deps: SlaReminderDeps) {
  const now = deps.now ?? (() => new Date());
  return async (): Promise<void> => {
    const current = now();
    for (const review of await deps.listExpiredReviews(current)) {
      const idempotencyKey = `sla.reminder:${review.applicationVersionId}:${Math.floor(current.getTime() / 900_000)}`; // 15 分钟窗口
      if (review.claimedByEmployeeId !== null) {
        await deps.emitOutbox({
          eventType: "application.review.sla.reminder",
          aggregateType: "application",
          aggregateId: review.applicationVersionId,
          payload: { employeeId: review.claimedByEmployeeId },
          idempotencyKey,
        });
      }
      for (const admin of await deps.listApplicationAdmins()) {
        await deps.createNotification({
          recipientEmployeeId: admin,
          eventType: "application.review.sla.overdue",
          aggregateId: review.applicationVersionId,
          message: `应用「${review.name}」审核已超过 SLA，请处理。`,
        });
      }
    }
  };
}
```

- [ ] **Step 4: 修改 SLA 计算（application.service.ts:275 与 :392）**

```ts
slaDueAt: addBusinessDays(new Date(), 2),
```

导入 `addBusinessDays`（从 `../system/outbox/sla-reminder.worker.js`）。

- [ ] **Step 5: 在 worker 注册定时任务**

`apps/worker/src/main.ts` 中 `retentionTimer` 模式旁（:106-131 附近）新增：

```ts
const slaRunner = createSlaReminderRunner({
  listExpiredReviews: runtime.reviewRepository.listExpiredReviews,
  listApplicationAdmins: runtime.identityRepository.listEmployeeIdsWithRole.bind(runtime.identityRepository, "application_admin"),
  createNotification: runtime.notifications.createForEvent.bind(runtime.notifications),
  emitOutbox: runtime.outboxStore.append.bind(runtime.outboxStore),
});
await slaRunner();
const slaTimer = setInterval(() => {
  void slaRunner().catch((error: unknown) => {
    runtime.logger.error({ error }, "sla reminder run failed");
  });
}, 15 * 60 * 1000);
```

同时在 `application.repository.ts` 新增：

```ts
async listExpiredReviews(now: Date): Promise<Array<{ applicationVersionId: string; claimedByEmployeeId: string | null; ownerEmployeeId: string; name: string }>> {
  return this.db
    .selectFrom("application_review_queue as queue")
    .innerJoin("applications as app", "app.application_id", "queue.application_id")
    .select([
      "queue.application_version_id as applicationVersionId",
      "queue.claimed_by_employee_id as claimedByEmployeeId",
      "app.owner_employee_id as ownerEmployeeId",
      "app.name",
    ])
    .where("queue.status", "in", ["available", "claimed"])
    .where("queue.sla_due_at", "<", now)
    .execute();
}
```

- [ ] **Step 6: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test sla-reminder && corepack pnpm --filter @ai-hub/worker test
git add packages/server/src/system/outbox/ packages/server/src/application/ apps/worker/src/main.ts
git commit -m "feat(review): 2-business-day SLA with 24h/48h reminders"
```

---

### Task 5: 已发布应用并发版本上限 + 提交前撤回（P1-6b）

**Files:**
- Modify: `packages/server/src/application/application.service.ts`（`submitForReview` :360-419、新增 `cancelPendingReview`）
- Modify: `packages/server/src/application/application.controller.ts`（新增撤回端点）
- Modify: `packages/server/src/application/application.dto.ts`（新增 DTO）
- Test: `packages/server/src/application/application.service.test.ts`、`apps/api/test/application.real.e2e-spec.ts`

**Interfaces:**
- Consumes: `ApplicationRecord.pendingVersionId: string | null`；`setApplicationStatus({ applicationId, expectedStatus, status, pendingVersionId })`
- Produces: `submitForReview` 在存在 pending 版本时抛 `REVIEW_ALREADY_PENDING`；`cancelPendingReview(actor, applicationVersionId)` → 队列置 `completed`、`pending_version_id` 置空、应用状态回滚 `sourceStatus`

- [ ] **Step 1: 写失败测试**

```ts
// application.service.test.ts
it("rejects a second concurrent review submission while one is pending", async () => {
  // 已发布应用已有 pendingVersionId = "version-1"
  const app = makePublishedApplication({ pendingVersionId: "version-1" });
  // submitForReview(version-2) → REJECTED with REVIEW_ALREADY_PENDING
  await expect(service.submitForReview(actor, "version-2")).rejects.toThrow("REVIEW_ALREADY_PENDING");
});

it("cancels a pending review and restores the previous state", async () => {
  // published 应用提交更新 → cancelPendingReview → pendingVersionId 置空、queue completed
  const result = await service.cancelPendingReview(actor, "version-2");
  expect(result.status).toBe("published");
  expect(result.pendingVersionId).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test application`
Expected: FAIL — 第二个提交不报错；`cancelPendingReview` 不存在

- [ ] **Step 3: submitForReview 增加 pending 检查**

在 `application.service.ts:375`（`INVALID_APPLICATION_TRANSITION` 检查）后插入：

```ts
if (application.pendingVersionId !== null) {
  throw new Error("REVIEW_ALREADY_PENDING");
}
```

- [ ] **Step 4: 实现 cancelPendingReview**

```ts
/** 待审核版本在最终结论前可以由提交人撤回（规格 §5.5）。 */
async cancelPendingReview(
  actor: ActorContext,
  applicationVersionId: string,
): Promise<ApplicationRecord> {
  await this.assertAuthorized(actor, allowedActions.update);
  const version = await this.requireVersion(applicationVersionId);
  if (version.createdByEmployeeId !== actor.employeeId) {
    throw new Error("APPLICATION_OWNER_REQUIRED");
  }
  const application = await this.requireApplication(version.applicationId);
  if (application.pendingVersionId !== applicationVersionId) {
    throw new Error("REVIEW_NOT_PENDING");
  }
  return this.repository.withTransaction(async (repository) => {
    await repository.completeReviewQueue(applicationVersionId);
    const updated = await repository.setApplicationStatus({
      applicationId: application.applicationId,
      expectedStatus: "published",
      status: "published",
      pendingVersionId: null,
    });
    await this.recordChange(
      repository,
      "application.review.withdrawn",
      application.applicationId,
      applicationVersionId,
      actor.employeeId,
    );
    return updated;
  });
}
```

控制器新增 `POST /internal/applications/:applicationVersionId/review-withdraw`（`ReviewWithdrawRequestDto` 可为空 DTO），服务委托 + ProblemDetails 统一异常处理。

- [ ] **Step 5: e2e 覆盖**

`apps/api/test/application.real.e2e-spec.ts` 新增场景：发布应用 → 提交新版本 → 提交第二个版本返回 `REVIEW_ALREADY_PENDING` → 撤回 → 再提交成功。

- [ ] **Step 6: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test application && corepack pnpm --filter @ai-hub/api test application.real
git add packages/server/src/application/ apps/api/test/application.real.e2e-spec.ts
git commit -m "feat(review): enforce single pending version and allow submitter withdrawal"
```

---

### Task 6: 首次发布审核通过自动上架（P1-6c）

**Files:**
- Modify: `packages/server/src/application/application.service.ts`（`decide` 审核结论分支）
- Test: `packages/server/src/application/application.service.test.ts`、`apps/api/test/application.real.e2e-spec.ts`

**Interfaces:**
- Consumes: `ReviewQueueRecord.sourceStatus: "draft" | "published"`；`review(actor, ...)` 现有 decide 逻辑（`application.service.ts:481` 附近）
- Produces: `sourceStatus === "draft"` 且 `decision === "approve"` 时，应用状态直接 `published`（不再要求责任人手动 `publish`）

- [ ] **Step 1: 写失败测试**

```ts
it("auto-publishes a first-time approved application", async () => {
  // draft 应用提交 → 管理员 approve → 应用 status 直接 published
  const result = await service.review(adminActor, "version-1", { decision: "approve", comment: "ok" });
  expect(result.status).toBe("published");
  expect(result.currentVersionId).toBe("version-1");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test application`
Expected: FAIL — approve 后应用仍是 `in_review`（等待手动 publish）

- [ ] **Step 3: 修改 decide 的 approve 分支**

找到 `application.service.ts` 中 `decide`（约 :481-600）的 approve 分支，将 `sourceStatus === "draft"` 时仅置 `in_review → published` 的现有逻辑改为：

```ts
if (queue.sourceStatus === "draft") {
  const updated = await repository.setApplicationStatus({
    applicationId,
    expectedStatus: "in_review",
    status: "published",
    currentVersionId: applicationVersionId,
  });
  await repository.registerToCatalog({
    applicationId,
    name: application.name,
    summary: application.summary,
  });
  // 记录 application.published 变更（复用现有 recordChange 模式）
  await this.recordChange(repository, "application.published", applicationId, applicationVersionId, actor.employeeId);
} else {
  // 既有 published-update 分支：swap currentVersionId + pending 置空
}
```

- [ ] **Step 4: 确认原 `publish` 端点兼容**

检查 `application.service.ts:563-616` 的 `publish` 方法：对 `in_review` 来源的路径改为仅兼容已通过但未自动上架的历史数据（`status === "in_review" && pendingVersionId === null && currentVersionId !== null` 时仍允许手动 publish）；新流程不产生该状态。

- [ ] **Step 5: e2e + 提交**

```bash
corepack pnpm --filter @ai-hub/server test application && corepack pnpm --filter @ai-hub/api test application.real
git add packages/server/src/application/ apps/api/test/
git commit -m "feat(review): auto-publish first-time approved applications"
```

---

### Task 7: 驳回原因必填 + 维护人禁自审 + 领取超时释放 + 超管转交（P1-6d）

**Files:**
- Modify: `packages/server/src/application/application.dto.ts:115-132`（`ReviewRequestDto.comment` 必填）
- Modify: `packages/server/src/application/application.service.ts`（`claimReview` 自审检查 :428、`decide` 驳回校验、`transferReviewTask` 新方法）
- Modify: `packages/server/src/application/application.controller.ts`（转交端点）
- Modify: `packages/server/src/system/outbox/sla-reminder.worker.ts`（领取超时释放逻辑并入 T4 任务）
- Test: `packages/server/src/application/application.service.test.ts`

**Interfaces:**
- Consumes: `ReviewQueueRecord`、`ApplicationRecord.maintainerEmployeeIds: string[]`（若不存在则从版本快照读 `draft.maintainers`）
- Produces: `claimReview` 对维护人抛 `SELF_REVIEW_FORBIDDEN`；`transferReviewTask(actor, applicationVersionId, newClaimantEmployeeId)`（超管 + 队列 claimed 前提）

- [ ] **Step 1: 写失败测试**

```ts
it("rejects review without a required comment for reject decision", async () => {
  await expect(service.review(adminActor, "version-1", { decision: "reject", comment: "" })).rejects.toThrow("REVIEW_COMMENT_REQUIRED");
});

it("bans maintainers from self-review", async () => {
  const app = makeApplication({ maintainerEmployeeIds: [maintainerActor.employeeId] });
  await expect(service.claimReview(maintainerActor, "version-1")).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
});

it("lets a super admin transfer a claimed review task", async () => {
  const transferred = await service.transferReviewTask(superAdminActor, "version-1", "other-admin");
  expect(transferred.claimedByEmployeeId).toBe("other-admin");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test application`
Expected: FAIL — 空原因通过；维护人可领取；无 transfer 方法

- [ ] **Step 3: DTO 必填**

`application.dto.ts` 中 `ReviewRequestDto.comment` 增加：

```ts
@IsNotEmpty()
comment!: string;
```

并引入 `IsNotEmpty`（`class-validator`）。注意 `request_changes` 结论同样需要原因（其语义 = 驳回，保留现状）。

- [ ] **Step 4: service 校验与转交**

`claimReview`（:428）改为同时检查维护人：

```ts
if (
  application.ownerEmployeeId === actor.employeeId ||
  (application.maintainerEmployeeIds ?? []).includes(actor.employeeId)
) {
  throw new Error("SELF_REVIEW_FORBIDDEN");
}
```

> 若 `ApplicationRecord` 无 `maintainerEmployeeIds`，则从该应用当前版本快照读取 `draft.maintainers`（`requireVersion` 后访问 `version.content.maintainers`），并在 `application.types.ts` 的 `ApplicationRecord` 上补充该字段（仓库查询时映射）。

`decide` 驳回分支（原 :510-537 附近）增加：

```ts
if (decision === "reject" && !comment?.trim()) {
  throw new Error("REVIEW_COMMENT_REQUIRED");
}
```

新增：

```ts
/** 超级管理员可以将已领取的审核任务转交给其他应用管理员（规格 §5.5）。 */
async transferReviewTask(
  actor: ActorContext,
  applicationVersionId: string,
  newClaimantEmployeeId: string,
): Promise<ReviewQueueRecord> {
  if (!hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)) {
    throw new Error("REVIEW_TRANSFER_FORBIDDEN");
  }
  const queue = await this.requireReviewQueue(applicationVersionId);
  if (queue.status !== "claimed") {
    throw new Error("REVIEW_QUEUE_NOT_CLAIMED");
  }
  return this.repository.withTransaction(async (repository) => {
    const updated = await repository.transferReviewQueue(applicationVersionId, newClaimantEmployeeId);
    await this.recordChange(repository, "application.review.transferred", queue.applicationId, applicationVersionId, actor.employeeId);
    return updated;
  });
}
```

`application.repository.ts` 新增：

```ts
async transferReviewQueue(applicationVersionId: string, employeeId: string): Promise<ReviewQueueRecord> {
  const row = await this.db
    .updateTable("application_review_queue")
    .set({ claimed_by_employee_id: employeeId, claimed_at: new Date() })
    .where("application_version_id", "=", applicationVersionId)
    .where("status", "=", "claimed")
    .returningAll()
    .executeTakeFirstOrThrow();
  return this.mapReviewQueue(row);
}
```

- [ ] **Step 5: 领取超时自动释放（并入 T4 的 sla-reminder.worker.ts）**

在 `createSlaReminderRunner` 中新增：`listExpiredClaims(now)`（`claimed_at < now - 24h`）→ 对每条执行 `releaseReviewQueue`（CAS 语义天然防并发）+ 发出 `application.review.claim_expired` 事件（矩阵键已在 T3 补齐）。

```ts
// deps 增加 listExpiredClaims、releaseClaim
for (const claim of await deps.listExpiredClaims(current)) {
  await deps.releaseClaim(claim.applicationVersionId);
  await deps.emitOutbox({
    eventType: "application.review.claim_expired",
    aggregateType: "application",
    aggregateId: claim.applicationVersionId,
    payload: { previouslyClaimedBy: claim.claimedByEmployeeId },
    idempotencyKey: `claim.expired:${claim.applicationVersionId}:${Math.floor(current.getTime() / 900_000)}`,
  });
}
```

`application.repository.ts` 补充 `listExpiredClaims`（`claimed_at < now - 24h` 且 `status = 'claimed'`）。24h 常量建议放 `sla-reminder.worker.ts` 导出（`CLAIM_HOLD_MS = 24 * 60 * 60 * 1000`）。

- [ ] **Step 6: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test application sla-reminder && corepack pnpm --filter @ai-hub/api test application.real
git add packages/server/src/application/ packages/server/src/system/outbox/
git commit -m "feat(review): require reject reason, ban maintainer self-review, expire stale claims, allow transfer"
```

---

### Task 8: 自动校验报告落库 + 展示（P1-7）

**Files:**
- Modify: `packages/server/src/application/artifact-verification.worker.ts`（verify 各检查点写入 `application_validation_checks`）
- Modify: `packages/server/src/application/application.repository.ts`（`recordValidationCheck`、`listValidationChecks`）
- Modify: `packages/server/src/application/application.types.ts`（端口签名）
- Modify: `packages/server/src/creator/creator.service.ts`（汇总校验报告供前端）
- Modify: `apps/web/src/pages/creator/CreatorCenterPage.tsx` 与 `apps/web/src/pages/applications/ApplicationReviewPage.tsx`（校验报告卡片接入真实数据）
- Test: `packages/server/src/application/artifact-verification.worker.test.ts`

**Interfaces:**
- Consumes: `application_validation_checks` 表（0017:41-51：`validation_check_id/application_version_id/check_code/label/status('passed'|'safe'|'warning'|'info'|'failed')/detail/created_at`，unique `(application_version_id, check_code)`）
- Produces: `recordValidationCheck({ applicationVersionId, checkCode, label, status, detail }): Promise<void>`（幂等 upsert）；`listValidationChecks(applicationVersionId): Promise<ValidationCheckRecord[]>`

- [ ] **Step 1: 写失败测试（worker 写入报告）**

```ts
// artifact-verification.worker.test.ts
it("records validation checks during successful verification", async () => {
  const checks: unknown[] = [];
  const repo = makeRepo({ recordValidationCheck: async (c) => { checks.push(c); return; } });
  const worker = new ArtifactVerificationWorker({ ...makeDeps(repo), signer: undefined, verifier: makeVerifier(true) });
  await worker.verify("upload-1");
  expect(checks.map((c: any) => c.checkCode)).toContain("artifact.digest");
  expect(checks.map((c: any) => c.checkCode)).toContain("artifact.malware_scan");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test artifact-verification`
Expected: FAIL — 无校验记录

- [ ] **Step 3: worker 写入校验点**

在 `artifact-verification.worker.ts` 的 `verify` 流程中，每个检查点调用记录：

```ts
// SHA-256 校验通过后（:55-59 之后）
await this.recordCheck(upload, {
  checkCode: "artifact.digest",
  label: "SHA-256 摘要校验",
  status: "passed",
  detail: upload.sha256 ?? null,
});
// 扫描通过后（:71 之后）
await this.recordCheck(upload, {
  checkCode: "artifact.malware_scan",
  label: "恶意软件扫描",
  status: "passed",
  detail: "ClamAV clean",
});
// 签名校验通过后（:84 之后）
await this.recordCheck(upload, {
  checkCode: "artifact.signature",
  label: "数字签名校验",
  status: upload.signature !== null && upload.signature.length > 0 ? "passed" : "warning",
  detail: "未签名制品，需人工确认",
});
```

`fail()` 路径同样在 `:166-190` 内写一条 `failed`：

```ts
await this.recordCheck(upload, {
  checkCode: "artifact.verification",
  label: "自动校验",
  status: "failed",
  detail: errorCode,
});
```

新增私有方法：

```ts
private async recordCheck(
  upload: ArtifactUploadRecord,
  input: { checkCode: string; label: string; status: "passed" | "warning" | "failed"; detail: string | null },
): Promise<void> {
  const record = this.options.repository.recordValidationCheck;
  if (record === undefined) return;
  const applicationVersionId = upload.applicationVersionId;
  if (applicationVersionId === null) return;
  await record.call(this.options.repository, { applicationVersionId, ...input });
}
```

`ArtifactUploadRecord` 若无 `applicationVersionId` 字段则从 `repository.findArtifactUpload` 的关联查询补充（`artifact_uploads` 表已有关联列，确认行映射）。

- [ ] **Step 4: 仓库实现**

`application.repository.ts`：

```ts
async recordValidationCheck(input: { applicationVersionId: string; checkCode: string; label: string; status: "passed" | "safe" | "warning" | "info" | "failed"; detail: string | null }): Promise<void> {
  await this.db
    .insertInto("application_validation_checks")
    .values({ ...input, detail: input.detail })
    .onConflict((oc) =>
      oc.columns(["application_version_id", "check_code"]).doUpdateSet({
        label: input.label,
        status: input.status,
        detail: input.detail,
      }),
    )
    .execute();
}

async listValidationChecks(applicationVersionId: string): Promise<ValidationCheckRecord[]> {
  const rows = await this.db
    .selectFrom("application_validation_checks")
    .selectAll()
    .where("application_version_id", "=", applicationVersionId)
    .orderBy("created_at", "asc")
    .execute();
  return rows.map((row) => ({ ...row, createdAt: row.created_at }));
}
```

- [ ] **Step 5: 前端接入**

`apps/web/src/modules/application/application.client.ts` 新增 `getValidationChecks(versionId)` 查询；`CreatorCenterPage.tsx` 的校验报告卡片（原"自动校验报告"占位）改为渲染 `listValidationChecks` 结果（Tag：passed=绿色/成功、warning=橙/警告、failed=红/失败、info=默认）；`ApplicationReviewPage.tsx` 同卡片替换（原 :134-135 "后续并入" 注释处）。

- [ ] **Step 6: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test artifact-verification && corepack pnpm --filter @ai-hub/web test
git add packages/server/src/application/ packages/server/src/creator/ apps/web/src/
git commit -m "feat(review): persist and display artifact auto-validation report"
```

---

### Task 9: 未签名制品标记人工确认（P1-8）

**Files:**
- Create: `packages/database/src/migrations/0041_artifact_signed.ts`（`artifact_uploads.signed` 列）
- Modify: `packages/database/src/migrate.ts`
- Modify: `packages/server/src/application/artifact-verification.worker.ts:73-80`（不再自动签名）
- Modify: `packages/server/src/application/application.service.ts`（`createVersion`/`submitForReview` 校验未签名需显式确认）
- Modify: `packages/server/src/application/application.dto.ts`（`acceptUnsigned` 字段）
- Modify: `apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx`（未签名确认勾选）
- Test: `packages/server/src/application/artifact-verification.worker.test.ts`

**Interfaces:**
- Consumes: `ArtifactUploadRecord.signature: string | null`；`createVersion` 输入
- Produces: 未签名上传 `signed=false`；`createVersion({ ..., acceptUnsigned?: boolean })`；`submitForReview` 遇到未签名版本且未确认时抛 `UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION`

- [ ] **Step 1: 写失败测试**

```ts
it("does not auto-sign unsigned artifacts and flags them", async () => {
  const worker = new ArtifactVerificationWorker({ ...makeDeps(repo), signer: makeSigner(), verifier: makeVerifier(true) });
  const result = await worker.verify("upload-unsigned");
  expect(result).not.toBeNull();
  expect(result?.signed).toBe(false);
});

it("requires explicit acceptance for unsigned artifacts at version creation", async () => {
  await expect(service.createVersion(actor, "app-1", { ...input, artifactSignature: null })).rejects.toThrow("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
  await expect(service.createVersion(actor, "app-1", { ...input, artifactSignature: null, acceptUnsigned: true })).resolves.toBeDefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test artifact-verification application`
Expected: FAIL — worker 自动签名；无确认校验

- [ ] **Step 3: migration 0041 + worker 修改**

```ts
// 0041_artifact_signed.ts
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table artifact_uploads
    add column signed boolean not null default true
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table artifact_uploads
    drop column if exists signed
  `.execute(db);
}
```

`artifact-verification.worker.ts` :73-80 改为：

```ts
let signed = upload.signature !== null && upload.signature.length > 0;
if (!signed && this.options.signer !== undefined) {
  // 规格 §5.5：未签名制品不得自动签名，必须标记并进入人工审核确认。
  signed = false;
}
```

`finalizeArtifactVerification` 调用（:101-105）增加 `signed` 字段（仓库 `finalizeArtifactVerification` 更新 `signed` 列并返回）。`ArtifactUploadRecord` 类型补充 `signed: boolean`。

- [ ] **Step 4: service 校验**

`createVersion`（:320-322 的 `ARTIFACT_NOT_VERIFIED` 后）与 `submitForReview`（:369-371）增加：

```ts
const upload = await this.repository.findVerifiedArtifact({ applicationId, objectKey: input.artifactKey, sha256: input.artifactSha256, signature: input.artifactSignature ?? null });
if (upload !== null && upload.signed === false && input.acceptUnsigned !== true) {
  throw new Error("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
}
```

`CreateVersionInput` 增加 `acceptUnsigned?: boolean`；`CreateVersionDto` 增加对应装饰器字段。前端向导"预览/提交"步：若该版本制品未签名，显示警告勾选框"我已知晓制品未签名并接受风险"，勾选后传 `acceptUnsigned: true`。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test artifact-verification application && corepack pnpm --filter @ai-hub/web test
git add packages/database/src/migrations/0041_artifact_signed.ts packages/database/src/migrate.ts packages/server/src/application/ apps/web/src/pages/creator/
git commit -m "fix(artifact): stop auto-signing unsigned artifacts, require explicit acceptance"
```

---

### Task 10: 归档/下架恢复路径 + 维护人申请下架（P1-9）

> 说明：规格 §5.5 的"草稿、已撤回和已驳回应用可以物理删除"在 T5/T6 完成后自动闭环——从未审核通过的应用撤回后回滚到 `draft`（`deleteApplication` 已允许 draft 删除），审核通过后的应用由"删除保护"守卫。本任务只补恢复路径与维护人申请下架。

**Files:**
- Modify: `packages/server/src/application/application.service.ts`（`createVersion` 允许 archived/withdrawn；`submitForReview` 允许；新增 `requestWithdraw`）
- Modify: `packages/server/src/application/application.controller.ts`（`requestWithdraw` 端点）
- Test: `packages/server/src/application/application.service.test.ts`

**Interfaces:**
- Consumes: `createVersion` :314-318（archived/withdrawn 检查）；`submitForReview` :373（状态白名单）
- Produces: archived/withdrawn 应用可创建新版本并进入审核，approve 后直接 `published`（T6 的自动上架逻辑复用）；`requestWithdraw(actor, applicationId, reason)` → 审计 + 通知责任人与应用管理员

- [ ] **Step 1: 写失败测试**

```ts
it("allows creating a new version from an archived application for recovery", async () => {
  const archived = makeApplication({ status: "archived" });
  await expect(service.createVersion(ownerActor, "app-1", validInput)).resolves.toBeDefined();
});

it("allows a maintainer to request withdrawal", async () => {
  await service.requestWithdraw(maintainerActor, "app-1", "应用已停止维护");
  // 期望产生审计事件 application.withdraw.requested 与站内通知
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test application`
Expected: FAIL — archived 被拒；无 `requestWithdraw`

- [ ] **Step 3: 放宽恢复路径**

`createVersion` :314-318：移除 `archived` 拒绝（保留 `withdrawn` 允许——规格："下架或归档后恢复必须创建版本并由其他应用管理员审核"，两者都允许）。改为仅拒绝：

```ts
if (application.status === "archived" || application.status === "withdrawn") {
  // 恢复路径：允许创建新版本，但强制走审核
  this.recoveryFrom = application.status;
}
```

> 简化实现：不新增字段，直接删除该检查（`:314-319` 整段移除）。`submitForReview` :373 的状态白名单改为 `["draft", "published", "withdrawn", "archived"]`；approve 时（T6 逻辑）对 `sourceStatus` 为 `withdrawn/archived` 的同样置 `published`。

- [ ] **Step 4: requestWithdraw 实现**

```ts
/** 维护人可以申请下架；由责任人/应用管理员确认执行（规格 §5.5）。 */
async requestWithdraw(
  actor: ActorContext,
  applicationId: string,
  reason: string,
): Promise<void> {
  const application = await this.requireApplication(applicationId);
  const maintainers = application.maintainerEmployeeIds ?? [];
  if (
    application.ownerEmployeeId !== actor.employeeId &&
    !maintainers.includes(actor.employeeId)
  ) {
    throw new Error("APPLICATION_MAINTAINER_REQUIRED");
  }
  this.requireStatus(application, "published");
  if (reason.trim().length === 0) {
    throw new Error("WITHDRAW_REASON_REQUIRED");
  }
  return this.repository.withTransaction(async (repository) => {
    await this.recordChange(
      repository,
      "application.withdraw.requested",
      applicationId,
      null,
      actor.employeeId,
      { reason, by: actor.employeeId },
    );
    await this.notifications.queue(actor, "application.withdraw.requested", {
      recipientEmployeeId: application.ownerEmployeeId,
      aggregateId: applicationId,
      variables: { reason },
    });
  });
}
```

> 需要在 `application.service.ts` 构造函数注入 `notifications`（`DingTalkNotificationMatrixService` 类型，与 demand 模块相同模式），并在 `application.module.ts`/`forTest` 装配中接线；矩阵增加场景 `application.withdraw.requested`（T3 中一并加）。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test application
git add packages/server/src/application/
git commit -m "feat(application): recovery path for archived/withdrawn apps and maintainer withdraw request"
```

---

## Sprint 2 — P1 其余（第 2 周）

### Task 11: Web URL 白名单 + SSRF 校验（P1-10）

**Files:**
- Create: `packages/server/src/system/security/web-url-policy.ts`
- Create: `packages/server/src/system/security/web-url-policy.test.ts`
- Modify: `packages/config/src/*`（`webTargetAllowlist` 配置项）
- Modify: `packages/server/src/application/application.service.ts`（`configureDelivery` :693-723 与 `createVersion` 校验）
- Modify: `packages/server/src/application/application.module.ts`（传递配置）

**Interfaces:**
- Consumes: `config.webTargetAllowlist: { protocols: ["http", "https"]; allowedHostnames: string[]; allowedPorts: number[]; allowedCidrs: string[] }`
- Produces: `validateWebTargetUrl(rawUrl, policy, resolveHost?): Promise<URL>`；违规抛 `WEB_URL_POLICY_VIOLATION`（detail 说明违规类型）

- [ ] **Step 1: 写失败测试**

```ts
// web-url-policy.test.ts
import { validateWebTargetUrl } from "./web-url-policy.js";

const policy = {
  protocols: ["https"],
  allowedHostnames: ["apps.internal.example.com", ".corp.example.com"],
  allowedPorts: [443, 8443],
  allowedCidrs: ["10.0.0.0/8", "172.16.0.0/12"],
};

it("accepts a whitelisted https host", async () => {
  const url = await validateWebTargetUrl("https://apps.internal.example.com:8443/dashboard", policy);
  expect(url.hostname).toBe("apps.internal.example.com");
});

it("rejects unknown hosts and ports", async () => {
  await expect(validateWebTargetUrl("http://evil.example.net", policy)).rejects.toThrow("WEB_URL_PROTOCOL_NOT_ALLOWED");
  await expect(validateWebTargetUrl("https://apps.internal.example.com:8080/", policy)).rejects.toThrow("WEB_URL_PORT_NOT_ALLOWED");
});

it("rejects DNS resolution to non-allowlisted CIDRs", async () => {
  const resolveHost = async () => [{ address: "10.9.9.9", family: 4 }];
  await expect(validateWebTargetUrl("https://apps.internal.example.com/", policy, resolveHost)).rejects.toThrow("WEB_URL_CIDR_NOT_ALLOWED");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test web-url-policy`
Expected: FAIL — module not found

- [ ] **Step 3: 实现校验器**

```ts
// web-url-policy.ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface WebTargetPolicy {
  protocols: string[];
  allowedHostnames: string[];
  allowedPorts: number[];
  allowedCidrs: string[];
}

function ipInCidrs(address: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => {
    const [network, prefixText] = cidr.split("/");
    const prefix = Number(prefixText);
    if (Number.isNaN(prefix)) return false;
    const ip = addressToInt(address);
    const net = addressToInt(network);
    if (ip === null || net === null) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ip & mask) === (net & mask);
  });
}

function addressToInt(address: string): number | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export async function validateWebTargetUrl(
  rawUrl: string,
  policy: WebTargetPolicy,
  resolveHost: (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string; family: number }>> = lookup,
): Promise<URL> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error("WEB_URL_INVALID");
  }
  if (target.username !== "" || target.password !== "") {
    throw new Error("WEB_URL_CREDENTIALS_FORBIDDEN");
  }
  if (!policy.protocols.includes(target.protocol.slice(0, -1))) {
    throw new Error("WEB_URL_PROTOCOL_NOT_ALLOWED");
  }
  const port = target.port === "" ? (target.protocol === "https:" ? 443 : 80) : Number(target.port);
  if (!policy.allowedPorts.includes(port)) {
    throw new Error("WEB_URL_PORT_NOT_ALLOWED");
  }
  const hostname = target.hostname.toLowerCase().replace(/[.]$/, "");
  const allowed = policy.allowedHostnames.some(
    (entry) =>
      hostname === entry ||
      (entry.startsWith(".") && hostname.endsWith(entry)),
  );
  if (!allowed) {
    throw new Error("WEB_URL_HOST_NOT_ALLOWED");
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolveHost(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("WEB_URL_DNS_FAILED");
  }
  if (
    addresses.length === 0 ||
    !addresses.every(({ address }) => ipInCidrs(address, policy.allowedCidrs))
  ) {
    throw new Error("WEB_URL_CIDR_NOT_ALLOWED");
  }
  return target;
}
```

- [ ] **Step 4: 接线到 configureDelivery 与 createVersion**

`configureDelivery`（:706 事务前）对 `input.channel === "web_app"` 且 `input.entryUrl` 非空时调用 `await validateWebTargetUrl(input.entryUrl, this.webTargetPolicy)`。`application.module.ts` 的 `register(databaseUrl, webTargetPolicy?)` 传入；`forTest` 提供宽松策略（`protocols: ["http", "https"], allowedHostnames: ["*"], allowedPorts: [80, 443], allowedCidrs: ["0.0.0.0/0"]` 测试用——或直接在测试中构造 service 时传默认宽松策略）。

`packages/config/src/runtime-config.ts` 新增 `WEB_TARGET_ALLOWLIST` 环境变量（JSON），默认值为内网示例策略；`RuntimeConfig` 类型加入 `webTargetAllowlist: WebTargetPolicy`。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test web-url-policy application && corepack pnpm --filter @ai-hub/config test
git add packages/server/src/system/security/web-url-policy.ts packages/server/src/application/ packages/config/src/ packages/database/src/migrations/ 2>/dev/null
git commit -m "feat(security): enforce intranet URL allowlist for web app deliveries"
```

---

### Task 12: 小程序渠道 + 二维码校验 + 桌面/移动 OS 元数据（P1-11）

**Files:**
- Create: `packages/database/src/migrations/0042_delivery_targets.ts`
- Modify: `packages/database/src/migrate.ts`
- Modify: `packages/contracts/src/application.ts`（`DeliveryDraftItem` 扩展）
- Create: `packages/server/src/application/qr-code-validator.ts`
- Create: `packages/server/src/application/qr-code-validator.test.ts`
- Modify: `packages/server/src/application/application.service.ts`（交付目标保存校验）
- Modify: `apps/web/src/pages/creator/ApplicationCreateWizardPage.tsx`（小程序渠道/OS 选择）

**Interfaces:**
- Consumes: `DeliveryDraftItem { channel, entryUrl, minClientVersion, enabled, assetIds }`
- Produces: `deliveryTargets?: DeliveryTarget[]`；`validateMiniProgramQr(buffer, platform): Promise<string>`（返回解析出的目标标识或抛错）

- [ ] **Step 1: 写失败测试（二维码校验器）**

```ts
// qr-code-validator.test.ts
import { validateMiniProgramQr } from "./qr-code-validator.js";

it("rejects non-image qr uploads", async () => {
  await expect(validateMiniProgramQr(Buffer.from("not an image"), "wechat")).rejects.toThrow("QR_DECODE_FAILED");
});

it("rejects qr content that is not a valid mini program target", async () => {
  const png = await loadFixture("not-a-miniapp-qr.png");
  await expect(validateMiniProgramQr(png, "wechat")).rejects.toThrow("QR_TARGET_FORMAT_INVALID");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test qr-code-validator`
Expected: FAIL — module not found

- [ ] **Step 3: contracts 扩展 + migration 0042**

`packages/contracts/src/application.ts`：

```ts
export type DeliveryTarget =
  | { kind: "desktop"; os: "windows" | "macos"; arch: string | null }
  | { kind: "mobile"; platform: "android" | "ios"; arch: string | null }
  | { kind: "miniprogram"; platform: "wechat" | "dingtalk" | "alipay"; appId: string; qrCodeAssetId: string; versionNote: string | null; enabled: boolean };

export interface DeliveryDraftItem {
  channel: DeliveryChannel;
  entryUrl: string | null;
  minClientVersion: string | null;
  enabled: boolean;
  assetIds: string[];
  targets?: DeliveryTarget[];
}
```

```ts
// 0042_delivery_targets.ts
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists delivery_targets (
      delivery_target_id uuid primary key default gen_random_uuid(),
      delivery_id uuid not null references application_deliveries(delivery_id) on delete cascade,
      kind text not null check (kind in ('desktop', 'mobile', 'miniprogram')),
      os text,
      platform text,
      arch text,
      app_id text,
      qr_code_asset_id uuid references application_assets(asset_id) on delete set null,
      version_note text,
      enabled boolean not null default true,
      created_at timestamptz not null default now()
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists delivery_targets`.execute(db);
}
```

- [ ] **Step 4: 二维码校验器实现**

```ts
// qr-code-validator.ts
import { decode } from "jsqr";
import { PNG } from "pngjs";

const MINI_PROGRAM_TARGET_PATTERNS: Readonly<Record<string, RegExp>> = {
  wechat: /^(https:\/\/|weixin:\/\/).*|^wxa:/i,
  dingtalk: /^(https:\/\/|dingtalk:\/\/)/i,
  alipay: /^(https:\/\/|alipays:\/\/)/i,
};

export async function validateMiniProgramQr(
  buffer: Buffer,
  platform: string,
): Promise<string> {
  const png = PNG.sync.read(buffer); // 失败抛 ERR_INVALID_FILE
  const { data, width, height } = png;
  const decoded = decode(new Uint8ClampedArray(data), width, height);
  if (decoded === null) throw new Error("QR_DECODE_FAILED");
  const content = decoded.data;
  const pattern = MINI_PROGRAM_TARGET_PATTERNS[platform];
  if (pattern === undefined || !pattern.test(content)) {
    throw new Error("QR_TARGET_FORMAT_INVALID");
  }
  return content;
}
```

> 新增依赖 `jsqr`（纯 JS）与 `pngjs`；运行 `corepack pnpm install` 并提交 lockfile。

- [ ] **Step 5: service 接线**

`configureDelivery` 中保存 `targets`：`repository.saveDeliveryTargets(deliveryId, input.targets)`；`createVersion`/`submitForReview` 完整度校验（:1058-1171）扩展：`channel === "mini_program"` 必须有 ≥1 个 `miniprogram` target 且 `qrCodeAssetId` 对应资产存在（通过 `unified-upload` 完成态校验），保存时调用 `validateMiniProgramQr`（读取资产 buffer 后校验）。`application.repository.ts` 新增 `saveDeliveryTargets`/`listDeliveryTargets`。

前端向导"基本信息"步：channel 为 `mini_program` 时渲染平台多选（微信/钉钉/支付宝）+ 二维码上传；为 `desktop_app`/`mobile_app` 时渲染 OS/平台选择。提交 payload 含 `targets`。

- [ ] **Step 6: 测试 + 提交**

```bash
corepack pnpm install && corepack pnpm --filter @ai-hub/server test qr-code-validator application && corepack pnpm --filter @ai-hub/web test
git add packages/contracts/ packages/database/src/migrations/0042_delivery_targets.ts packages/database/src/migrate.ts packages/server/src/application/ apps/web/src/pages/creator/ pnpm-lock.yaml
git commit -m "feat(delivery): per-target OS/platform metadata and validated mini program QR codes"
```

---

### Task 13: 搜索升级 pg_trgm + 评分排序（P1-12）

**Files:**
- Create: `packages/database/src/migrations/0043_search_trgm.ts`
- Modify: `packages/database/src/migrate.ts`
- Modify: `packages/server/src/catalog/catalog.repository.ts:118-129`（搜索重写）
- Test: `packages/server/src/catalog/catalog.repository.integration.test.ts`（Testcontainers）

**Interfaces:**
- Consumes: `metadata.search_name/search_summary/search_pinyin/search_initials`（0004）
- Produces: 排序 `exact → prefix → tag/category → trgm`；`ILIKE '%x%'` 仅保留在 trgm 兜底层

- [ ] **Step 1: 写失败集成测试**

```ts
// catalog.repository.integration.test.ts
it("ranks exact name matches above prefix matches above fuzzy matches", async () => {
  // 种子：应用 A 名 "报销助手"，应用 B 名 "报销助手Pro"，应用 C 名 "智能报销平台"
  const results = await repo.listCatalog({ actor, query: "报销助手", ...defaultPage });
  expect(results.items.map((r) => r.name)).toEqual(["报销助手", "报销助手Pro", "智能报销平台"]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test catalog.repository.integration`
Expected: FAIL — 排序为字母序或插入序，非规格排序

- [ ] **Step 3: migration 0043**

```ts
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pg_trgm`.execute(db);
  await sql`
    create index if not exists catalog_search_name_trgm
    on application_metadata using gin (search_name gin_trgm_ops)
  `.execute(db);
  await sql`
    create index if not exists catalog_search_summary_trgm
    on application_metadata using gin (search_summary gin_trgm_ops)
  `.execute(db);
  await sql`
    create index if not exists catalog_search_pinyin_trgm
    on application_metadata using gin (search_pinyin gin_trgm_ops)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists catalog_search_name_trgm`.execute(db);
  await sql`drop index if exists catalog_search_summary_trgm`.execute(db);
  await sql`drop index if exists catalog_search_pinyin_trgm`.execute(db);
  await sql`drop extension if exists pg_trgm`.execute(db);
}
```

- [ ] **Step 4: 搜索重写（catalog.repository.ts:118-129）**

```ts
if (queryText !== undefined && queryText.length > 0) {
  const prefix = `${queryText}%`;
  const fuzzy = `%${queryText}%`;
  // 规格 §10.2：精确匹配、名称前缀、标签分类、简介模糊依次排序。
  query = query.where((eb) =>
    eb.or([
      eb("metadata.search_name", "=", queryText),
      eb("metadata.search_name", "ilike", fuzzy),
      eb("metadata.search_pinyin", "ilike", fuzzy),
      eb("metadata.search_initials", "ilike", prefix),
      eb("metadata.search_summary", "ilike", fuzzy),
      eb("metadata.search_name", "%", queryText), // pg_trgm 相似度兜底
    ]),
  ).orderBy((eb) =>
    eb.case()
      .when("metadata.search_name", "=", queryText).then(0)
      .when("metadata.search_name", "ilike", prefix).then(1)
      .when("metadata.search_pinyin", "ilike", prefix).then(2)
      .when("metadata.search_initials", "ilike", prefix).then(3)
      .when("metadata.search_name", "%", queryText).then(4)
      .when("metadata.search_summary", "ilike", fuzzy).then(5)
      .else(6)
      .end(),
  );
}
```

> `%` 运算符 = trgm 相似度（`pg_trgm` 提供）。若 Kysely 表达式类型报错，退化为 `sql<number>` 表达式实现同分支。`LIKE '%'` 中缀在 trgm 索引下用 `ILIKE` + gin_trgm_ops 可加速（`%x%` 支持 trgm 索引），前缀匹配可加 btree 索引（0043 中可加 `search_name varchar_pattern_ops`）。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test catalog.repository.integration && corepack pnpm migrate
git add packages/database/src/migrations/0043_search_trgm.ts packages/database/src/migrate.ts packages/server/src/catalog/
git commit -m "feat(catalog): trgm-backed search with spec ranking order"
```

---

### Task 14: 通知事件补齐（P1-13）

**Files:**
- Modify: `packages/server/src/notification/dingtalk-matrix.service.ts`（新增场景）
- Modify: `packages/server/src/demand/demand.service.ts`（`review` 后通知提交人）
- Modify: `packages/server/src/interaction/interaction.service.ts`（举报处理后通知举报人）
- Modify: `packages/server/src/application/application.service.ts`（`artifact.verification.failed` 通知上传者）
- Test: 对应 service 测试

**Interfaces:**
- Consumes: T3 已对齐的矩阵
- Produces: 矩阵新增 `demand.reviewed`（已在 T3）、`interaction.report.resolved`、`application.artifact.failed`；调用点补齐

- [ ] **Step 1: 写失败测试**

```ts
// demand.service.test.ts
it("notifies the submitter when a demand review is decided", async () => {
  await service.review(adminActor, "demand-1", { decision: "reject", reason: "重复" });
  expect(notifications.queued).toContainEqual(
    expect.objectContaining({ scenario: "demand.reviewed", recipientEmployeeId: "submitter-1" }),
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test demand interaction`
Expected: FAIL — 无通知断言通过

- [ ] **Step 3: 矩阵新增场景**

```ts
"interaction.report.resolved": {
  recipientRole: "report_author",
  messageTemplate: "你对应用 {aggregateId} 的举报已处理。",
},
"application.artifact.failed": {
  recipientRole: "artifact_uploader",
  messageTemplate: "应用 {aggregateId} 的安装包校验失败：{errorCode}。",
},
```

> `interaction.report.resolved` 的 `recipientRole: "report_author"`：`authorizeRecipient`（`dingtalk-matrix.service.ts:74-79` 的 `DingTalkRecipientAuthorizer`）接收 `(recipientEmployeeId, recipientRole, aggregateId, actor)`——在 `identity.ts` 的授权器实现中，对 `recipientRole === "report_author"` 的分支直接校验 `recipientEmployeeId === actor.employeeId`（举报人本人），无需角色查询。

- [ ] **Step 4: 调用点**

- `demand.service.ts` `review` 方法（:135-173）在 `recordMutation` 后：`await this.notifications.queue(actor, "demand.reviewed", { recipientEmployeeId: current.submitterEmployeeId, aggregateId: demandId, variables: { decision } })`。
- `interaction.service.ts` `resolveReport`（:231-355）在隐藏/恢复后：通知举报人（从 report 记录取 `reportedByEmployeeId`）。
- `artifact-verification.worker.ts` `fail()`（:166-190）已有 `artifact.verification.failed` outbox 事件 → 由 T14 的矩阵条目承接通知（需在 `apps/worker` 的 notification handler 中把 `artifact.verification.failed` 映射为站内通知：检查现有 `notification.created` handler 是否消费该事件，未消费则在 worker 注册新 handler `artifact.verification.failed → createForEvent(上传者)`）。上传者 = upload 记录的 `uploaded_by_employee_id`（`findArtifactUpload` 已可查）。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test demand interaction && corepack pnpm --filter @ai-hub/worker test
git add packages/server/src/ apps/worker/src/
git commit -m "feat(notification): complete spec event coverage (review decided, report resolved, artifact failed)"
```

---

### Task 15: 看板补齐 — 需求价值看板 + 单应用筛选 + 首屏 KPI（P1-14a）

**Files:**
- Modify: `packages/server/src/analytics/dashboard.types.ts`（`DashboardKey` 加 `demand_value`）
- Modify: `packages/server/src/analytics/dashboard-metrics.ts`（:3-35 增补）
- Modify: `packages/server/src/analytics/dashboard.service.ts`（:15-65 注册新看板 + 单应用筛选）
- Modify: `packages/server/src/analytics/aggregation.service.ts`（新指标聚合）
- Modify: `packages/server/src/analytics/analytics.controller.ts`（:112-128 单应用筛选参数）
- Modify: `apps/web/src/pages/analytics/AnalyticsDashboardPage.tsx`（新 Tab）
- Test: `packages/server/src/analytics/*.test.ts`

**Interfaces:**
- Consumes: `DashboardKey` 联合类型；`aggregation.service.ts:26-117` 的日聚合
- Produces: `demand_value` 看板（转化数、转化率、平均优先级分、试点完成数）；`platform` 首屏增加 `demand.converted_count`、`risk.high_risk_application_count`；单应用筛选 `GET /analytics/dashboards?applicationId=`

- [ ] **Step 1: 写失败测试**

```ts
// dashboard.service.test.ts
it("exposes the demand_value dashboard to demand operators", async () => {
  const dashboards = await service.listDashboards(demandOperatorActor);
  expect(dashboards.map((d) => d.key)).toContain("demand_value");
});

it("scopes single-application dashboard by applicationId for owners", async () => {
  const dash = await service.getDashboard(ownerActor, "application", { applicationId: "app-1" });
  expect(dash.scope.applicationId).toBe("app-1");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test dashboard`
Expected: FAIL — 无 `demand_value`；无单应用筛选

- [ ] **Step 3: 聚合与看板注册**

`dashboard-metrics.ts` 增补：

```ts
demand_value: [
  "demand.converted_count",
  "demand.converted_rate",
  "demand.avg_priority_score",
  "demand.pilot_completed_count",
],
```

`platform` 首屏追加 `"demand.converted_count"`、`"risk.high_risk_application_count"`。

`aggregation.service.ts` 日聚合新增两个派生指标（在既有行为事件聚合后计算）：
- `demand.converted_count`：当日 `demand.status.changed`（to=converted）事件计数（行为事件已有事件源？demand 状态变化是否记录行为事件——若没有，改为直接从 `demands` 表快照计数：`count(*) where status='converted' and converted_at in [day]`；`demands` 表需有 `converted_at` 列——若缺失，用 audit 事件表统计 `demand.status.changed` 详情 to=converted）。
- `risk.high_risk_application_count`：`applications` 表 join `application_reports`（未处理举报 >0 或 `health_status='failed'`）的计数快照（每次日聚合时写 `aggregate_metrics` 新行）。

`dashboard.service.ts` 注册 `demand_value` 看板，权限 = `demand_operator`；`getDashboard(actor, "application", { applicationId })` 校验 actor 是该应用 owner/maintainer 或有 `ANALYTICS_APPLICATION` 权限，聚合查询增加 `WHERE application_id = $1`。

- [ ] **Step 4: 前端 Tab**

`AnalyticsDashboardPage.tsx`（:32-69）新增 "需求价值" Tab（漏斗：需求提交→审核→认领→转化；KPI 卡：转化数/转化率/平均优先级/试点完成）。单应用看板页（`ApplicationDetailPage` 或创作者中心）调用 `getDashboard(..., { applicationId })`。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test dashboard aggregation && corepack pnpm --filter @ai-hub/web test
git add packages/server/src/analytics/ apps/web/src/pages/analytics/
git commit -m "feat(analytics): demand-value dashboard, per-application scoping, first-screen KPIs"
```

---

### Task 16: 小样本部门隐藏 + 匿名排除（P1-14b）

**Files:**
- Modify: `packages/server/src/analytics/aggregation.service.ts`（部门维度聚合脱敏）
- Modify: `packages/server/src/interaction/interaction.service.ts`（行为事件 metadata 匿名标记）
- Modify: `packages/server/src/analytics/dashboard.service.ts`（脱敏透出）
- Test: `packages/server/src/analytics/aggregation.service.test.ts`

**Interfaces:**
- Consumes: 部门维度指标聚合结果
- Produces: `department.*` 指标在部门有效员工数 < 5 时置 `null`（前端渲染"样本过小，已隐藏"）；`application_rated/application_commented` 事件在 `displayAnonymously` 时 `metadata.anonymous = true`，聚合排除

- [ ] **Step 1: 写失败测试**

```ts
it("hides department metrics below the small-sample threshold", async () => {
  const dash = await service.getDashboard(adminActor, "department", {});
  const smallDept = dash.series.find((s) => s.departmentId === "dept-tiny");
  expect(smallDept?.value).toBeNull();
});

it("excludes anonymous ratings from department charts", async () => {
  // seed 一条 anonymous rating 行为事件 → 聚合不含它
  await expect(aggregation).not.toContain...
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test aggregation dashboard`
Expected: FAIL

- [ ] **Step 3: 实现**

`aggregation.service.ts` 部门维度聚合后：

```ts
const SMALL_SAMPLE_THRESHOLD = 5;
// department_employee_counts 来自 identity 模块（聚合查询注入部门有效员工数）
for (const series of departmentSeries) {
  if (series.employeeCount < SMALL_SAMPLE_THRESHOLD) series.value = null;
}
```

`interaction.service.ts` `rate()` 与 `createComment()` 的 `analyticsEvents.record` 调用增加：

```ts
metadata: {
  source: "interaction.rating",
  anonymous: input.displayAnonymously === true,
},
```

聚合层：`eventName in ('application_rated','application_commented')` 且 `metadata.anonymous = true` 时不计入部门维度计数（保留平台总数）。

- [ ] **Step 4: 前端渲染**

`AnalyticsDashboardPage.tsx` 部门 Tab：`value === null` 时显示"样本过小，已隐藏"（tooltip 说明口径）。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test aggregation dashboard && corepack pnpm --filter @ai-hub/web test
git add packages/server/src/analytics/ packages/server/src/interaction/ apps/web/src/pages/analytics/
git commit -m "feat(analytics): hide small-sample department metrics and exclude anonymous interactions"
```

---

### Task 17: 导出后台化（P1-15）

**Files:**
- Create: `apps/worker/src/analytics-export.worker.ts`（或并入现有 worker 注册）
- Modify: `packages/server/src/analytics/export.service.ts`（拆分"创建任务"与"生成结果"）
- Modify: `packages/server/src/analytics/analytics.controller.ts`（异步端点）
- Modify: `apps/web/src/modules/analytics/`（轮询导出状态）
- Modify: `packages/server/src/analytics/analytics.repository.ts`（导出任务表/状态）
- Test: `packages/server/src/analytics/export.service.test.ts`、`apps/api/test/phase6.real.e2e-spec.ts`

**Interfaces:**
- Consumes: `analytics.export.requested` outbox 事件（export.service.ts:88-93 已有事件源）
- Produces: `createExportJob(actor, request): Promise<{ exportId, status: "pending" }>`；`GET /internal/analytics/exports/:exportId`（状态轮询）；`GET /internal/analytics/exports/:exportId/download`（权限重检后流式返回，24h TTL）

- [ ] **Step 1: 写失败测试**

```ts
it("returns a pending job id without synchronously generating rows", async () => {
  const job = await service.createExportJob(actor, request);
  expect(job.status).toBe("pending");
  expect(rowsGenerated).toBe(0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test export`
Expected: FAIL — 现有 `export` 同步返回行

- [ ] **Step 3: 拆分任务与生成**

`export.service.ts` 拆为：
- `createExportJob(actor, request)`：插入导出任务行（`analytics_exports` 表已存在——migration 0009 有导出表；确认列：状态、创建者、筛选条件、TTL、存储 key）→ `appendOutbox({ eventType: "analytics.export.requested", ... })` → 返回 `{ exportId, status: "pending" }`。
- `generateExport(exportId)`：worker handler 消费事件 → 复用现有 `:94-145` 的读取/审计逻辑 → 结果写入 Garage `exports/${exportId}.csv`（`ObjectStoragePort.put`）→ 更新任务状态 `ready` + `expires_at = now + 24h` → 事件 `analytics.export.completed`。

worker 注册：`apps/worker/src/main.ts` 增加 handler `analytics.export.requested → generateExport`（复用现有 `security.audit.export.requested` worker 的注册模式）。

- [ ] **Step 4: 下载端点**

```ts
// analytics.controller.ts
@Get(":exportId/download")
async downloadExport(@Param("exportId") exportId: string, @Req() req: Request) {
  const actor = extractActor(req);
  // 登录 + 权限 + 未过期重检
  await this.service.assertDownloadable(actor, exportId);
  const stream = await this.service.openExportStream(exportId);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${exportId}.csv"`);
  stream.pipe(res);
}
```

前端 `useAnalytics.ts` 的导出调用改为：POST 创建 → `setInterval` 轮询状态 → ready 后跳转 download URL。

- [ ] **Step 5: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test export && corepack pnpm --filter @ai-hub/worker test && corepack pnpm --filter @ai-hub/web test
git add packages/server/src/analytics/ apps/worker/src/ apps/web/src/modules/analytics/
git commit -m "feat(analytics): background export jobs with short-lived audited downloads"
```

---

### Task 18: 需求转化校验 + 需求审核 SLA（P1-16）

> 迁移编号修订：T14 已占用 0044（notification_create_permission，已应用于开发库、迁移名不可变），本任务改用 **0046**。

**Files:**
- Create: `packages/database/src/migrations/0046_demand_review_sla.ts`（`demands.sla_due_at`）
- Modify: `packages/database/src/migrate.ts`
- Modify: `packages/server/src/demand/demand.service.ts`（`advanceStatus` 转化校验 :624-660；`review` 设置 SLA :135-173）
- Modify: `packages/server/src/demand/demand.repository.ts`（`listExpiredDemandReviews`）
- Modify: `packages/server/src/system/outbox/sla-reminder.worker.ts`（扩展需求侧）
- Test: `packages/server/src/demand/demand.service.test.ts`

**Interfaces:**
- Consumes: `demand_application_links.is_primary`；`statusTransitions`
- Produces: `nextStatus === "converted"` 时校验主要解决方案对应应用 `status === "published"`，否则抛 `DEMAND_CONVERT_REQUIRES_PUBLISHED_APP`；`review` publish 时 `sla_due_at = addBusinessDays(now, 1)`

- [ ] **Step 1: 写失败测试**

```ts
it("blocks conversion unless the primary solution is published", async () => {
  // link is_primary → 应用 draft
  await expect(service.advanceStatus(operatorActor, "demand-1", 5, "converted")).rejects.toThrow("DEMAND_CONVERT_REQUIRES_PUBLISHED_APP");
});

it("sets a 1-business-day SLA when a demand is published", async () => {
  await service.review(adminActor, "demand-1", { decision: "publish" });
  expect(repository.lastSlaDueAt).toBeDefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test demand`
Expected: FAIL — 转化无校验；无 SLA

- [ ] **Step 3: migration 0044 + 实现**

```ts
// 0044_demand_review_sla.ts
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table demands
    add column sla_due_at timestamptz
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table demands
    drop column if exists sla_due_at
  `.execute(db);
}
```

`demand.service.ts` `advanceStatus`（:637 之后）：

```ts
if (nextStatus === "converted") {
  const primary = await this.repository.findPrimaryLinkedApplication(demandId);
  if (primary === null || primary.status !== "published") {
    throw new Error("DEMAND_CONVERT_REQUIRES_PUBLISHED_APP");
  }
}
```

`review` publish 分支（:154-160 事务内）：

```ts
await repository.setReviewSla(demandId, addBusinessDays(new Date(), 1));
```

`demand.repository.ts` 新增 `findPrimaryLinkedApplication`（join `demand_application_links` where is_primary → `applications.status`）与 `setReviewSla`、`listExpiredDemandReviews(now)`（`status = 'pending_review' and sla_due_at < now`）。

`sla-reminder.worker.ts` 扩展：`listExpiredDemandReviews` → 通知全部 `demand_operator`（`listEmployeeIdsWithRole("demand_operator")`）。

- [ ] **Step 4: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test demand sla-reminder && corepack pnpm migrate
git add packages/database/src/migrations/0044_demand_review_sla.ts packages/database/src/migrate.ts packages/server/src/demand/ packages/server/src/system/outbox/
git commit -m "feat(demand): require published primary app for conversion, 1-day review SLA"
```

---

### Task 19: 生命周期治理 — 健康检查 / 待移交 / 可信标签 / 禁用员工显示（P1-17, P1-21）

> 迁移编号修订：T14 已占用 0044、T18 改用 0046，本任务迁移编号从 0045 改为 **0047**。

**Files:**
- Create: `packages/server/src/application/health-check.worker.ts`
- Create: `packages/server/src/application/health-check.worker.test.ts`
- Modify: `apps/worker/src/main.ts`（注册定时健康检查）
- Modify: `packages/server/src/application/application.service.ts`（待移交标记；可信标签写接口 `updateTrustMetadata`）
- Modify: `packages/server/src/catalog/catalog.controller.ts`（治理端点）
- Modify: `packages/server/src/interaction/interaction.repository.ts`（评论列表 join 员工状态）
- Modify: `packages/server/src/interaction/interaction.types.ts`（`authorDisplayStatus`）
- Modify: `apps/web/src/pages/applications/*` 与市场详情（"已停用用户"显示）

**Interfaces:**
- Consumes: `validateWebTargetUrl`（T11）；`metadata.health_status`（application.repository.ts:322,1195）；`identity.repository.listEmployeeIdsWithRole`
- Produces: `createHealthCheckRunner({ listWebDeliveries, storage, policy, logger, now? })`；`updateTrustMetadata(actor, applicationId, { trustLabel?, deprecatedReason?, replacementApplicationId? })`（应用管理员权限，审计）

- [ ] **Step 1: 写失败测试**

```ts
// health-check.worker.test.ts
it("marks deliveries as failed when HEAD times out", async () => {
  const runner = createHealthCheckRunner({
    listWebDeliveries: async () => [{ applicationId: "app-1", entryUrl: "https://apps.internal.example.com/" }],
    checkTarget: async () => ({ ok: false, status: "timeout" }),
    updateHealth: async (appId, status) => { seen.push([appId, status]); },
  });
  await runner();
  expect(seen).toContainEqual(["app-1", "failed"]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test health-check`
Expected: FAIL — module not found

- [ ] **Step 3: 健康检查 worker**

```ts
// health-check.worker.ts
export interface HealthCheckDeps {
  listWebDeliveries: () => Promise<Array<{ applicationId: string; entryUrl: string }>>;
  checkTarget: (url: URL) => Promise<{ ok: boolean; status: "up" | "timeout" | "error" }>;
  updateHealth: (applicationId: string, status: "unknown" | "healthy" | "failed") => Promise<void>;
  now?: () => Date;
}

export function createHealthCheckRunner(deps: HealthCheckDeps) {
  return async (): Promise<void> => {
    for (const delivery of await deps.listWebDeliveries()) {
      try {
        const target = new URL(delivery.entryUrl);
        const result = await deps.checkTarget(target);
        await deps.updateHealth(delivery.applicationId, result.ok ? "healthy" : "failed");
      } catch {
        await deps.updateHealth(delivery.applicationId, "failed");
      }
    }
  };
}
```

`apps/worker/src/main.ts` 注册：`setInterval(runner, 15 * 60 * 1000)`；`checkTarget` 实现用 `fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) })`（Node ≥18 内置），仅对 `validateWebTargetUrl`（T11 策略）通过的目标发起请求；`updateHealth` 走 `application.repository.updateHealthStatus`（`application_metadata.health_status`，:1195 附近已有字段）。

- [ ] **Step 4: 待移交 + 可信标签**

`application.service.ts` 新增：

```ts
/** 责任人离职/禁用后的待移交状态（规格 §5.13）。 */
async markOwnerPendingTransfer(actor: ActorContext, applicationId: string): Promise<ApplicationRecord> {
  await this.assertAuthorized(actor, allowedActions.update);
  const application = await this.requireApplication(applicationId);
  return this.repository.withTransaction(async (repository) => {
    const updated = await repository.setOwnerTransferPending(applicationId, true);
    await this.recordChange(repository, "application.owner.pending_transfer", applicationId, null, actor.employeeId);
    const admins = await this.identityPort?.listEmployeeIdsWithRole("application_admin") ?? [];
    if (admins.length > 0) {
      await this.notifications.queue(actor, "application.owner.pending_transfer", {
        recipientEmployeeId: admins[0]!,
        aggregateId: applicationId,
      });
    }
    return updated;
  });
}

/** 可信标签与废弃信息（应用管理员治理操作，规格 §5.13）。 */
async updateTrustMetadata(
  actor: ActorContext,
  applicationId: string,
  input: { trustLabel?: string | null; deprecatedReason?: string | null; replacementApplicationId?: string | null },
): Promise<void> {
  await this.assertAuthorized(actor, allowedActions.publish);
  return this.repository.withTransaction(async (repository) => {
    await repository.updateTrustMetadata(applicationId, input);
    await this.recordChange(repository, "application.trust_metadata.updated", applicationId, null, actor.employeeId, { ...input });
  });
}
```

> `notifications.queue` 的收件人占位需要实现时用 T3 的 `listEmployeeIdsWithRole("application_admin")` 填充（同 demand 模式）。`repository.setOwnerTransferPending`/`updateTrustMetadata` 在 `application.repository.ts` 实现（`application_metadata` 加列 `owner_pending_transfer boolean default false` 与 `trust_label text`、`deprecated_reason` 已有 `deprecated_reason`/`replacement_application_id` 列（:74-75）——仅需迁移加 `owner_pending_transfer` 与 `trust_label`（独立 `0047_application_trust_metadata.ts`）。

- [ ] **Step 5: 禁用员工显示"已停用"**

`interaction.repository.ts` 评论列表查询 join `employees`：

```ts
.select([
  "comment.*",
  "employee.employee_number as authorEmployeeNumber",
  "employee.disabled_at as authorDisabledAt",
])
.leftJoin("employees as employee", "employee.employee_id", "comment.author_employee_id")
```

`interaction.types.ts` 的评论记录加 `authorDisabledAt: string | null`；web 详情页评论组件：`authorDisabledAt !== null` 时显示"已停用用户"Tag（不显示姓名）。

- [ ] **Step 6: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test health-check application interaction && corepack pnpm --filter @ai-hub/worker test && corepack pnpm --filter @ai-hub/web test
git add packages/database/src/migrations/0047_application_trust_metadata.ts packages/database/src/migrate.ts packages/server/src/ apps/worker/src/ apps/web/src/
git commit -m "feat(lifecycle): web health checks, pending-owner transfer, trust metadata, disabled-author display"
```

---

### Task 20: 部门删除迁移 + 角色变更撤销会话 + Cookie Secure（P1-18, P1-19）

**Files:**
- Modify: `packages/server/src/identity/identity.service.ts`（`deleteDepartment` :269-286 迁移化；`setEmployeeRoles` :288-302 撤销会话）
- Modify: `packages/server/src/identity/identity.controller.ts`（删除部门 DTO 加 `targetDepartmentId`；cookie Secure :966-972）
- Modify: `packages/server/src/identity/identity.repository.ts`（`migrateDepartmentAndDelete`、`revokeEmployeeSessions`）
- Modify: `apps/api/src/main.ts` 或 controller 构造（传 `secureCookies: boolean`）
- Test: `packages/server/src/identity/identity.service.test.ts`

**Interfaces:**
- Consumes: `deleteDepartment(departmentId)`；`setEmployeeRoles(employeeId, roleCodes)`；session cookie 生成 :955-973
- Produces: `deleteDepartment(actor, departmentId, targetDepartmentId)`（迁移子部门/成员/归属应用后删除，事务内）；`setEmployeeRoles` 变更后撤销该员工全部会话；生产环境 cookie 加 `Secure`

- [ ] **Step 1: 写失败测试**

```ts
it("migrates children, members and apps before deleting a department", async () => {
  await service.deleteDepartment(orgAdminActor, "dept-1", { targetDepartmentId: "dept-2" });
  expect(migrated).toEqual(["child-dept", "member-1", "app-1"]);
  expect(deletedDepartments).toContain("dept-1");
});

it("revokes all sessions when roles change", async () => {
  await service.setEmployeeRoles(orgAdminActor, "emp-1", ["employee", "application_admin"]);
  expect(revokedSessions).toContain("emp-1");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @ai-hub/server test identity`
Expected: FAIL — 无迁移参数；无撤销

- [ ] **Step 3: deleteDepartment 迁移化**

`identity.service.ts:269-286` 改为：

```ts
async deleteDepartment(
  actor: ActorContext,
  departmentId: string,
  options: { targetDepartmentId?: string },
): Promise<void> {
  await this.repository.withTransaction(async (repository) => {
    const children = await repository.listChildDepartments(departmentId);
    const members = await repository.listDepartmentMembers(departmentId);
    const apps = await repository.listApplicationsByDepartment(departmentId);
    if (children.length + members.length + apps.length > 0 && options.targetDepartmentId === undefined) {
      throw new Error("DEPARTMENT_MIGRATION_REQUIRED");
    }
    if (options.targetDepartmentId !== undefined) {
      await repository.migrateDepartmentContent(departmentId, options.targetDepartmentId);
    }
    await repository.deleteDepartment(departmentId);
    await repository.recordAudit({
      actorEmployeeId: actor.employeeId,
      eventType: "identity.department.deleted",
      subjectEmployeeId: null,
      details: { departmentId, migratedTo: options.targetDepartmentId ?? null },
    });
  });
}
```

`identity.repository.ts` 新增：
- `listChildDepartments`（`parent_department_id = $1`）
- `listDepartmentMembers`（`department_members where department_id = $1`）
- `listApplicationsByDepartment`（`applications where department_id = $1`）
- `migrateDepartmentContent(from, to)`：事务内 `update departments set parent_department_id = $to where parent_department_id = $from`（排除自迁移）、`update department_members set department_id = $to where department_id = $from`、`update applications set department_id = $to where department_id = $from`（主部门迁移约束：成员若已有 to 部门行则删旧行或更新主部门标志——以 `department_members` 表约束为准，冲突行先删除再插入）。

控制器 `DELETE /internal/departments/:departmentId` DTO 加可选 `targetDepartmentId`（应用管理员/组织管理员权限已由 `assertAuthorized` 把关）。

- [ ] **Step 4: 角色变更撤销会话**

`setEmployeeRoles`（:288-302）事务内增加：

```ts
const changed = await repository.hasRoleChange(employeeId, roleCodes);
if (changed) {
  await repository.revokeEmployeeSessions(employeeId);
}
```

`identity.repository.ts`：

```ts
async hasRoleChange(employeeId: string, roleCodes: readonly string[]): Promise<boolean> {
  const current = await this.db
    .selectFrom("employee_roles as er")
    .innerJoin("roles as r", "r.role_id", "er.role_id")
    .select("r.role_code")
    .where("er.employee_id", "=", employeeId)
    .execute();
  const currentCodes = current.map((r) => r.role_code).sort();
  const nextCodes = [...roleCodes].sort();
  return JSON.stringify(currentCodes) !== JSON.stringify(nextCodes);
}

async revokeEmployeeSessions(employeeId: string): Promise<void> {
  await this.db
    .updateTable("employee_sessions")
    .set({ revoked_at: new Date() })
    .where("employee_id", "=", employeeId)
    .where("revoked_at", "is", null)
    .execute();
}
```

- [ ] **Step 5: Cookie Secure**

`identity.controller.ts` 的 cookie 生成（:966-972）：构造参数加 `secureCookies: boolean`（来自 config：`nodeEnv === "production"` 或 `PUBLIC_ORIGIN` 以 https 开头），flags 改为：

```ts
const secure = this.secureCookies ? "; Secure" : "";
const flags = `Path=/; HttpOnly; SameSite=Lax${secure}`;
```

`identity.module.ts`/`forTest` 装配传入；`apps/api/src/main.ts` 装配处传 `config.nodeEnv === "production"`。

- [ ] **Step 6: 测试 + 提交**

```bash
corepack pnpm --filter @ai-hub/server test identity && corepack pnpm --filter @ai-hub/api test identity
git add packages/server/src/identity/ apps/api/src/main.ts
git commit -m "fix(identity): migrate dept content on delete, revoke sessions on role change, secure cookies in production"
```

---

## 收尾 — Sprint 验收

每个 Sprint 结束跑全量验证：

```bash
corepack pnpm verify
```

Sprint 2 结束追加：`corepack pnpm migrate`（确认 0040–0047 全部应用）→ 更新 PRD2APP.md 的状态标注（§9 中已关闭项打 ✅）→ 与项目方确认钉钉降级口径、备份介质、双机环境（Phase 8 前置）。
