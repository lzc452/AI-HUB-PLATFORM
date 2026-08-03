# Phase 6 Analytics Dashboard Export Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reproducible analytics, fixed dashboards, audited exports, a constrained Dify assistant boundary, and the complete DingTalk work-notification matrix on the accepted Phase 5 platform.

**Architecture:** Add a bounded `analytics` module to the existing NestJS modular monolith. PostgreSQL migration `0008` stores validated raw behavior events, daily aggregates, metric definitions, export jobs, assistant authorization/audit records, and retention metadata. Raw events are the source of truth; aggregates are rebuildable. Dashboard, export, and assistant services reuse `ActorContext`, RBAC, audience predicates, Audit, and Outbox.

**Tech Stack:** Node.js >=18.18, TypeScript strict mode, NestJS, Kysely, PostgreSQL, Vitest, Supertest, React/Vite/Ant Design, existing authorization, audit, outbox, and notification ports.

## Global Constraints

- Phase 5 is accepted from `feature/phase-05-ai-demand-innovation` at `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`; reuse its evidence and do not rerun Phase 3, Phase 4, or Phase 5 full gates as prerequisites.
- Continue the single-enterprise model; do not add `tenant_id`.
- Raw behavior events are retained for exactly 180 days by the Phase 6 retention policy; daily aggregates are rebuildable from raw events.
- Every dashboard, export, assistant, and notification path must preserve `ActorContext`, RBAC, audience authorization, Audit, and Outbox boundaries.
- Anonymous output is a projection; employee identity is retained only where the existing authorized audit path permits it.
- Dify receives no employee number, internal URL, file, QR code, or anonymous identity and is not exposed through an unrestricted public Open API.
- Do not introduce Redis, Elasticsearch, message queues, Kubernetes, microservices, or a second tenant model.
- Do not change Phase 3, 4, or 5 business semantics; schema extensions require migration `0008` and focused tests.
- Do not implement Phase 7 production deployment, security launch, or operations acceptance.

## Phase 6 baseline

- Base branch: `feature/phase-05-ai-demand-innovation`.
- Base commit: `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`.
- New branch: `feature/phase-06-analytics-dashboard-export-assistant`.
- Phase 3, 4, and 5 accepted evidence is consumed from the roadmap, Phase 4/5 plans and ledgers, ADR 0005/0006, and the remote Phase 5 branch.
- Existing untracked `.codex/` is user-owned workspace state and remains excluded from staging.

## Stable interfaces

```ts
export type BehaviorEventName =
  | "application_viewed" | "application_delivered" | "application_downloaded"
  | "demand_viewed" | "demand_liked" | "demand_commented"
  | "review_created" | "review_decided" | "export_requested"
  | "assistant_requested" | "notification_queued";

export interface RecordBehaviorEventInput {
  eventName: BehaviorEventName;
  aggregateType: "application" | "demand" | "review" | "export" | "assistant" | "notification";
  aggregateId: string;
  occurredAt: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface MetricDefinition {
  metricKey: string;
  label: string;
  sourceEvents: readonly BehaviorEventName[];
  formula: string;
  timeRange: "day" | "7d" | "30d" | "180d";
  requiredPermission: string;
  audienceRule: string;
  recompute: string;
}

export interface AnalyticsRepository {
  recordEvent(actor: ActorContext | null, input: RecordBehaviorEventInput): Promise<void>;
  rebuildDaily(from: string, to: string): Promise<{ eventCount: number; dayCount: number }>;
  getDashboard(actor: ActorContext, dashboardKey: string, range: { from: string; to: string }): Promise<unknown>;
}
```

## Ordered tasks

### Task 1: Phase 6 baseline, plan, ledger, ADR, and visualization

**Files:** Create the Phase 6 plan, ledger, ADR 0007; modify `processing_visualization.html`.

- [ ] Verify branch, exact Phase 5 ancestry, remote evidence, tracked status, and preserved `.codex/`.
- [ ] Record the Phase 6 baseline and explicit Phase 3–5 reuse and Phase 7 deferrals.
- [ ] Add the Phase 6 ordered work matrix and baseline event to the visualization.
- [ ] Run `git diff --check`; commit `docs(phase-06): establish analytics dashboard assistant plan`.

### Task 2: Behavior event contract, migration, retention, and audit boundary

**Files:** `packages/contracts/src/analytics.ts`, contracts index, `packages/database/src/schema.ts`, `migrate.ts`, migration `0008`, `packages/database/src/analytics-schema.integration.test.ts`, new `packages/server/src/analytics/*` tests/scaffolding.

- [x] Write failing PostgreSQL tests for allowed event names, metadata limits, 180-day retention fields, unique idempotency, daily aggregate keys, metric definitions, export/assistant audit records, outbox linkage, and no `tenant_id`.
- [x] Observe RED because migration `0008` and the analytics repository are absent; the first PostgreSQL attempt also recorded the unavailable Docker runtime.
- [x] Implement the normalized schema, event validation, idempotent insert, retention boundary, and transactionally paired Audit/Outbox records.
- [x] Run focused contracts/database/server tests; commit `feat(phase-06): add behavior event and retention schema`.

### Task 3: Daily aggregation, rebuild, and metric dictionary

**Files:** `packages/server/src/analytics/aggregation.*`, `metric-dictionary.*`, tests, database integration tests, `apps/api/test/phase6.real.e2e-spec.ts`.

- [x] Write failing tests proving day bucketing, duplicate event idempotency, 180-day boundary, rebuild equivalence, stable formulas, and dictionary metadata.
- [x] Observe RED, then implement the smallest SQL aggregation/rebuild service and versioned metric definitions.
- [x] Verify focused unit and real PostgreSQL aggregation tests; commit `feat(phase-06): add rebuildable daily analytics`.

### Task 4: Platform, market, application, and innovation dashboards

**Files:** `packages/server/src/analytics/dashboard.*`, dashboard tests, contracts, API e2e, Web route/components/tests.

- [x] Write failing tests for fixed dashboard keys, metric source/formula consistency, range handling, and audience-filtered application/demand data.
- [x] Implement read-only dashboard queries from daily aggregates with permission and audience checks before projection.
- [x] Verify focused server/API/Web tests; commit `feat(phase-06): add core analytics dashboards`.

### Task 5: Review, department, risk, runtime, and integration dashboards

**Files:** dashboard additions, metric dictionary, notification/outbox readers if needed, focused tests and API/Web fixtures.

- [x] Write failing tests for review SLA/decision metrics, department aggregates without individual access lists, risk buckets, runtime health aggregates, and integration delivery/retry metrics.
- [x] Implement the remaining fixed dashboards without changing existing lifecycle or notification semantics.
- [x] Verify focused tests; commit `feat(phase-06): add governance and operations dashboards`.

### Task 6: Permission filtering, anonymity, and audited backend export

**Files:** `packages/server/src/analytics/export.*`, migration extension only if needed, contracts, tests, API/Web export route tests.

- [ ] Write failing tests for permission denial, audience filtering before rows are serialized, anonymous projection, request/completion/failure/download audits, bounded date ranges, and non-public routes.
- [ ] Implement an authenticated export job through the existing service boundary; do not return unauthorized application access lists or sensitive event metadata.
- [ ] Verify focused server/API/Web export tests; commit `feat(phase-06): add audited analytics exports`.

### Task 7: Dify minimum context, redaction, authorization review, and degradation

**Files:** `packages/server/src/analytics/assistant.*`, `dify.port.ts`, redaction tests, API e2e, contracts, ADR/ledger updates.

- [ ] Write failing tests proving redaction of employee number, internal URL, file, QR code, and anonymous identity; explicit authorization review; safe fallback on timeout/5xx; audit of allow/deny/success/failure.
- [ ] Implement a dependency-injected Dify port with minimum context assembled only after dashboard/demand audience checks; do not add a public Open API.
- [ ] Verify fake-provider unit tests and real API boundary tests; commit `feat(phase-06): add guarded external assistant boundary`.

### Task 8: DingTalk notification matrix and Outbox delivery verification

**Files:** `packages/server/src/notification/*`, contracts, matrix tests, worker tests, API/Outbox integration tests, ledger/ADR.

- [ ] Write failing tests for every fixed notification scenario, recipient authorization, idempotency key, audit metadata, retry/failure state, and no direct provider call inside business transactions.
- [ ] Implement the complete Phase 6 matrix through the existing Outbox and DingTalk port; retain failures for retry and safe operator review.
- [ ] Verify focused server/worker/PostgreSQL tests; commit `feat(phase-06): complete DingTalk work notification matrix`.

### Task 9: API, PostgreSQL e2e, Web routes, permissions, audits, exports, and assistant

**Files:** `apps/api/test/phase6.real.e2e-spec.ts`, `apps/api/test/phase6.e2e-spec.ts`, Web analytics tests/routes, ledger, visualization.

- [ ] Write failing cross-layer tests for event ingestion, rebuild equality, all dashboard keys, permission/audience/anonymity rules, export audit, Dify redaction/degradation, and Outbox notification delivery.
- [ ] Implement only the missing wiring and route coverage exposed by RED tests.
- [ ] Run focused API/Web/PostgreSQL tests; update exact counts in the ledger and visualization; commit `test(phase-06): verify analytics dashboard export assistant flows`.

### Task 10: Phase 6 final gates, two-axis review, commit, push, and Draft PR

**Files:** ledger, ADR, plan checkboxes, visualization; no unrelated source files.

- [ ] Run the exact required final gate commands and Compose config; do not substitute cached results.
- [ ] Review the complete Phase 6 diff against the standards and Phase 6 spec axes; resolve all actionable findings.
- [ ] Verify branch ancestry/status and push without force; create/update Draft PR only if external permission allows it, otherwise record the exact blocker as incomplete.
- [ ] Commit `docs(phase-06): close analytics dashboard assistant gates` only after fresh evidence supports each claim.

## Completion gate

Phase 6 may be called complete only when dashboards are reproducible from raw
events, permissions and anonymity are correct, every export is audited, Dify
receives no prohibited sensitive data, real PostgreSQL/API/Web tests pass,
both review axes have no actionable findings, the Phase 6 branch is pushed,
and a Draft PR exists or the external blocker is explicitly recorded.
