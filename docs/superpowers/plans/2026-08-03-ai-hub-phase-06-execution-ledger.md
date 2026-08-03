# Phase 6 Execution Ledger

Date: 2026-08-03

## Baseline decision

Phase 5 is accepted input from remote branch
`feature/phase-05-ai-demand-innovation` at commit
`4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`. Phase 3, 4, and 5 accepted
evidence is consumed from their plans, ledgers, ADRs, roadmap, and remote
branch evidence. Phase 6 does not rerun those full gates before
implementation. The new branch is
`feature/phase-06-analytics-dashboard-export-assistant`.

Existing untracked `.codex/` is user-owned workspace state and is excluded
from staging.

## Scope and non-goals

Phase 6 delivers raw behavior events, 180-day retention, rebuildable daily
aggregation, fixed platform/market/application/innovation/review/department/
risk/runtime/integration dashboards, metric definitions, permissioned audited
exports, a constrained Dify assistant boundary, and the complete DingTalk work
notification matrix through Outbox. It does not change Phase 3–5 business
semantics or implement Phase 7 production deployment, security launch, or
operations acceptance. Redis, Elasticsearch, message queues, Kubernetes,
microservices, public Open API, a new tenant model, and sensitive Dify context
are prohibited.

## Ordered execution

1. Baseline, plan, ledger, ADR, visualization.
2. Behavior event contract, migration, retention, audit boundary.
3. Daily aggregation, rebuild, metric dictionary.
4. Platform/market/application/innovation dashboards.
5. Review/department/risk/runtime/integration dashboards.
6. Permissions, anonymity, audited export.
7. Dify minimum context, redaction, authorization review, degradation.
8. DingTalk matrix and Outbox verification.
9. API/PostgreSQL/Web cross-layer verification.
10. Final gates, two-axis review, push, Draft PR or blocker.

## Evidence log

| Gate | Evidence | Status |
|---|---|---|
| Phase 5 baseline | Remote branch at `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5` | accepted input |
| Phase 3–5 reuse | Existing plans, ledgers, ADRs, roadmap, and remote branch | accepted input |
| Phase 6 branch | Created from exact Phase 5 latest commit | passed |
| Baseline docs/visualization | Commit `53a0985`; `git diff --check` and `corepack pnpm format:check` exited 0 | passed |
| Behavior events/schema | Commit `66c3f5`; contracts 2/2; real PostgreSQL database command 3 files/21 tests; contracts/database/server typechecks and server lint passed | passed |
| Daily aggregation/metric dictionary | Server focused command 16 files/72 tests; typecheck/lint passed; rebuild service uses 180-day raw-event window and fixed dictionary | passed |
| Fixed dashboards | Commits `fdc06e3`, `f86f7d6`; server 18 files/76 tests; Web 4 files/18 tests; server/web typecheck and lint passed | passed |
| Permissioned audited export | Commits `2da4a89`, `5608f41`; server export tests and Docker-backed schema tests passed | passed |
| Dify boundary | Server 20 files/82 tests; server/API typecheck and server lint passed; fake provider redaction/auth/degradation tests passed | passed |
| DingTalk/Outbox matrix | Commit `de9e1ab`; server/worker/Docker-backed tests passed | passed |
| API/PostgreSQL/Web e2e | Commit `da8ac75`; API 10 files/19 tests and Web 4 files/18 tests passed | passed |
| Final gates/two-axis review | Initial review actionable findings remediated; fresh final gates and second review pending | in progress |
| GitHub push/Draft PR | Not attempted for Phase 6 | pending/external |

## Per-step evidence

This section is updated after every ordered step with exact commands, results,
commit, and blocker. No step is marked passed from an unexecuted or inferred
result.

### Step 1: Baseline and planning

- Branch: created from Phase 5 commit `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`.
- Remote evidence: local and `origin/feature/phase-05-ai-demand-innovation` both resolved to `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`; the remote ledger records Phase 5 full gates and two-axis review passed, with Draft PR blocked by HTTP 403/network reset.
- Docs: Phase 6 plan, execution ledger, ADR 0007, and visualization update established; Phase 6 progress is 5% in the dashboard.
- Verification: `git diff --check` exited 0; `corepack pnpm format:check` exited 0.
- Commit: `53a0985 docs(phase-06): establish analytics dashboard assistant plan`.

### Step 2: Behavior events, migration, retention, and audit boundary

- RED: `packages/contracts/src/analytics.test.ts` failed because `analytics.ts` was absent; the first Docker-backed database attempt failed with `Could not find a working container runtime strategy` until the authorized Docker Desktop Linux engine was used.
- GREEN: contract tests passed 2/2; the Docker-backed command `corepack pnpm --filter @ai-hub/database test -- src/analytics-schema.integration.test.ts` passed 3 files/21 tests, including the new 3/3 analytics schema tests, existing demand 3/3, and outbox 15/15. `@ai-hub/contracts` typecheck, `@ai-hub/database` typecheck, `@ai-hub/server` typecheck, `@ai-hub/server` lint, and the server focused command passed 15 files/70 tests.
- Schema: migration `0008_analytics_events` adds allow-listed raw events with 180-day expiry, idempotency, audience context, daily aggregate keys, metric definition metadata, append-only analytics audit, delete protection with an explicit retention-job escape, and indexes. No `tenant_id` was added.
- Boundary: `AnalyticsEventService` validates events, records the raw event, audit row, and Outbox event in one repository transaction; idempotent replays do not create duplicate audit/outbox rows.
- Commit: `66c3f5 feat(phase-06): add behavior event and retention schema`.

### Step 3: Daily aggregation, rebuild, and metric dictionary

- RED: `aggregation.service.test.ts` failed because the aggregation service and metric dictionary were absent.
- GREEN: `corepack pnpm --filter @ai-hub/server test -- src/analytics/aggregation.service.test.ts` passed 16 files/72 tests; `@ai-hub/server` typecheck and lint passed; `git diff --check` exited 0.
- Implementation: raw events are deduplicated by idempotency key, bounded to the retained 180-day window, bucketed by UTC day and audience scope, and deterministically upserted into daily aggregates. The fixed metric dictionary records source events, formula, time range, permission, audience rule, and recomputation method.
- Real PostgreSQL aggregation e2e: deferred to Step 9 cross-layer verification; no cached result is treated as evidence.
- Commit: `eb4a4ee feat(phase-06): add rebuildable daily analytics`.

### Step 4: Platform, market, application, and innovation dashboards

- RED: `dashboard.service.test.ts` failed because the dashboard service and fixed permission map were absent; the Web route test then failed with no `/analytics` route.
- GREEN: server dashboard command passed 17 files/75 tests; Web Phase 6 command passed 4 files/18 tests; server and Web typechecks/lints passed.
- Implementation: fixed dashboard keys read only the permitted metric keys from daily aggregates, reject unauthorized actors before querying, apply department scope for non-operators, bound ranges to 180 days, and filter output to fixed metrics. Web exposes a read-only aggregate shell with the core and governance dashboard labels.
- Commit: `fdc06e3 feat(phase-06): add core analytics dashboards`.

### Step 5: Review, department, risk, runtime, and integration dashboards

- RED: `dashboard-matrix.test.ts` failed because the fixed dashboard listing API was absent.
- GREEN: server command passed 18 files/76 tests; server typecheck and lint passed.
- Implementation: exposed a stable nine-key dashboard matrix and verified every governance/department/risk/runtime/integration metric has source events, formula, permission, audience, and recomputation metadata. No lifecycle or notification semantics changed.
- Commit: `f86f7d6 feat(phase-06): add governance and operations dashboards`.

### Step 6: Permission filtering, anonymity, and audited backend export

- RED: `export.service.test.ts` failed because the export service was absent; the new PostgreSQL export-job assertion then failed because `analytics_export_jobs` was absent.
- GREEN: server export command passed 19 files/79 tests; `@ai-hub/server` and `@ai-hub/database` typechecks/lint passed; Docker-backed database command passed 3 files/22 tests, including analytics schema 4/4; API contract plus inherited real PostgreSQL regression passed 9 files/18 tests with Docker Desktop Linux engine.
- Implementation: migration `0009_analytics_exports` stores a bounded export-job lifecycle; repository queries only daily aggregates within actor scope; service rejects unauthorized/overlong ranges before reading, projects anonymous/redacted identity, and audits requested/completed/failed/downloaded actions. Routes remain under `/internal/analytics` with identity headers and authorization.
- Commit: `2da4a89 feat(phase-06): add audited analytics exports`; follow-up test coverage commit `5608f41 test(phase-06): cover audited export service`.

### Step 7: Dify minimum context, redaction, authorization review, and degradation

- RED: `assistant.service.test.ts` failed because the assistant service and Dify boundary were absent.
- GREEN: server focused command passed 20 files/82 tests; server/API typechecks and server lint passed; the fake provider tests prove employee number, internal URL, file, QR code, and anonymous identity are excluded from the outbound payload, denied requests do not call Dify, and provider failure returns the safe local fallback with audit.
- Implementation: `AnalyticsAssistantService` uses an explicit authorization-review repository, an allow-listed minimum context, dependency-injected `DifyAssistantPort`, and no public Open API. Production uses an unavailable-provider fallback until external credentials are separately authorized.
- API route wiring is covered in the Phase 6 API contract; the Docker-backed API command passed 9 files/18 tests, including the guarded assistant route.
- Commit: `0a8d288 feat(phase-06): add guarded external assistant boundary`.

### Step 8: DingTalk notification matrix and Outbox delivery verification

- RED: the fixed DingTalk scenario matrix and post-transaction Outbox handler were absent; the first server run failed because the new handler module did not exist.
- GREEN: `@ai-hub/server` passed 22 files/87 tests, typecheck, lint, and format check; `@ai-hub/worker` passed 3 files/5 tests, typecheck, and lint; Docker-backed database tests passed 3 files/22 tests. The focused handler tests prove provider calls happen only from a claimed Outbox handler, delivery failures record `retry` and throw a safe retry code, and matrix metadata carries scenario, recipient role, and actor context.
- Implementation: fixed 14-scenario Phase 3-6 matrix is exposed through `NotificationModule`; matrix queueing reuses `NotificationService` authorization/idempotency/transaction boundary, enriches Outbox payload metadata, rejects sensitive template variables, and never calls DingTalk inside the business transaction. The handler is the post-Outbox DingTalk port boundary and preserves retry state.
- Visualization: `processing_visualization.html` records Phase 6 at 65% with implemented work and pending cross-layer/final gates.
- Commit: `de9e1ab feat(phase-06): complete DingTalk work notification matrix`.

### Step 9: API, PostgreSQL e2e, Web routes, permissions, audits, exports, and assistant

- RED: no real Phase 6 cross-layer evidence existed; the first test addition established the real PostgreSQL/API fixture and exposed the need to assert provider payloads and notification Outbox delivery.
- GREEN: Docker-backed `@ai-hub/api` run passed 10 files/19 tests, including the new real Phase 6 e2e; it proves raw event idempotency, daily rebuild value 2, protected dashboard/export/assistant routes, export and assistant audit rows, Dify allow-list redaction, and real Outbox-to-DingTalk delivery with `sent` notification status and audit metadata. Web passed 4 files/18 tests with typecheck/lint; API typecheck/lint and format check passed.
- Implementation: no public Open API was added; the real e2e composes the existing authenticated internal route boundary with PostgreSQL-backed analytics repositories and the existing worker/Outbox handler. The Web route remains a read-only fixed dashboard shell.
- Commit: `da8ac75 test(phase-06): verify analytics dashboard export assistant flows`.

### Step 10: Review remediation before final gates

- Two-axis review was run against Phase 5 fixed point `4a6e9e4` using the
  complete Phase 6 diff. Both axes found actionable items; none are accepted
  as deferred implementation risk.
- Remediation: added the retention service and audit boundary; made daily
  rebuild delete the target aggregate range before replacement; versioned and
  persisted all 12 metric definitions; added review SLA, demand report,
  assistant failure, and notification retry event sources; wired application,
  demand, review, export, assistant, and notification paths to behavior-event
  recording; added per-row export policy audits and download ownership checks;
  added dashboard read Audit/Outbox records; sanitized assistant questions and
  enforced metric audience roles; persisted DingTalk delivery error state;
  deduplicated dashboard metric mappings; and documented migration `0008` plus
  sequenced export extension `0009`.
- TDD evidence: server tests now pass 23 files/92 tests; contracts tests pass
  2/2; server typecheck and dependency boundaries pass. The application review
  event has a focused service assertion; retention, assistant, export,
  dashboard, notification, and handler tests cover the remaining remediation
  boundaries.
- Commit: pending until the remediation diff is independently verified and
  committed.

### Step 10b: Second review remediation

- The second two-axis review found actionable gaps in runtime retention
  execution, retained-range enforcement, audience fields, analytics RBAC
  provisioning, missing producers, SLA scan behavior, export/assistant
  Outbox, denial audits, Dify adversarial redaction/degradation, metric
  version propagation, and DingTalk recipient authorization.
- RED: added focused range, export denial/Outbox, assistant boundary,
  worker-retention, role/metric-version schema, and notification authorization
  assertions before implementation.
- GREEN: server passes 24 files/96 tests; worker passes 3 files/6 tests;
  database passes 3 files/24 tests including the `0010` role seed,
  `0011` aggregate version column, and retention function security metadata;
  server/database/worker/API typechecks and dependency boundaries pass.
- Implementation now schedules retention and overdue-review scans in the
  existing worker, applies one 180-day range policy, persists resource audience
  fields, instruments download/like/comment producers, emits export/assistant
  Outbox lifecycles, audits denials, constrains and redacts Dify strings,
  carries metric version into aggregates, provisions analytics roles, and
  authorizes DingTalk recipients through IdentityService role records.
- Commit: pending until the real API/database regression and a fresh two-axis
  review pass on this remediation.

### Step 10c: Final boundary hardening

- RED: the review follow-up exposed that denied export audits could be rolled
  back with the rejected transaction, assistant telemetry failures could block
  an authorized provider call, the worker did not register the business
  notification handler, the retention trigger accepted a spoofed session GUC,
  and the notification matrix defaulted to a non-resource-aware authorizer.
- GREEN: focused server tests pass 24 files/98 tests; server/database/worker
  typechecks, lint, format check, and dependency boundaries pass. Docker-backed
  PostgreSQL passes 3 files/24 tests; real API passes 10 files/19 tests; Worker
  passes 3 files/7 tests.
- Implementation: denial lifecycle audit/outbox runs outside export
  transactions; dashboard/export reads include department and employee
  audience scopes and current metric version; Dify redaction covers internal
  hostnames, employee phrases, UNC paths, and Chinese equivalents while audit
  and Outbox telemetry degrades independently; retention deletion validates
  the SECURITY DEFINER owner and rejects future cutoffs; the Worker registers
  `notification.created`; production DingTalk authorization resolves both
  role and aggregate resource ownership; malformed notification payloads are
  rejected at the handler boundary.
- Commit: pending until the final exact gates, local two-axis audit, push, and
  Draft PR status are recorded.

### Step 11: Final gates and delivery evidence

- Final exact gate command passed with Docker Desktop Linux engine:
  `corepack pnpm format:check`, `corepack pnpm lint`,
  `corepack pnpm typecheck`, `corepack pnpm boundaries`,
  `corepack pnpm test`, `corepack pnpm build`,
  `node scripts/verify-doc-links.mjs`, and
  `docker compose -f compose.yaml -f compose.test.yaml config --quiet`.
- Full test evidence: 15 Turbo tasks passed; database 3 files/24 tests,
  server 24 files/98 tests, API 10 files/19 tests, Web 4 files/18 tests,
  Worker 3 files/7 tests. Build completed with the pre-existing frontend
  chunk-size warning only.
- Follow-up audit rechecked every finding from the two prior standards/spec
  reviews against the final boundary-hardening diff; no actionable finding is
  left open. No Phase 3-5 business semantics were changed, no tenant_id or
  prohibited infrastructure was introduced, and Phase 7 remains deferred.
- Commit: `5ccc132 fix(phase-06): harden final analytics boundaries`.
- Remaining external delivery evidence: branch push and Draft PR status.
