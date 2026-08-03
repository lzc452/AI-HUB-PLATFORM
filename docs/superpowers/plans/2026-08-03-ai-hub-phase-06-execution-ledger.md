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
| Permissioned audited export | Not executed yet | pending |
| Dify boundary | Not executed yet | pending |
| DingTalk/Outbox matrix | Not executed yet | pending |
| API/PostgreSQL/Web e2e | Not executed yet | pending |
| Final gates/two-axis review | Not executed yet | pending |
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
- Commit: pending until the Step 6 diff is staged and committed.
