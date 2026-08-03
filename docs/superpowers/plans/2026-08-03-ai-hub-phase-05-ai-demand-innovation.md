# AI Hub Phase 5 AI Demand and Innovation Square Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a governed, auditable AI demand lifecycle from structured request through innovation-square collaboration, prioritization, piloting, application association, and formal application publication without bypassing the Phase 3 application lifecycle gates.

**Architecture:** Add a bounded `demand` module to the existing NestJS modular monolith. PostgreSQL migration `0006` stores normalized demand, audience, collaboration, moderation, progress, pilot, application-link, and audit records; all writes use repository transactions, audit rows, and outbox events. Audience predicates are applied before list/detail output, anonymous display is presentation-only, and application promotion delegates to the existing `ApplicationService` so artifact verification, review, publication, and archive guards remain authoritative.

**Tech Stack:** Node.js >=18.18, TypeScript strict mode, NestJS, Kysely, PostgreSQL, Vitest, Supertest, React/Vite/Ant Design, existing `ActorContext`, RBAC, authorization, Audit, Outbox, and application lifecycle modules.

## Global Constraints

- Phase 4 is accepted input from commit `f60def66699bfbb0192b60fa1d256d98159d198b`; do not rerun Phase 4 or Phase 3 full gates as a Phase 5 prerequisite.
- Continue the single-enterprise model; do not add `tenant_id`.
- Continue using `ActorContext`, RBAC, audience authorization, transaction boundaries, Audit, and Outbox.
- Anonymous display must never delete real identity; administrator traceability requires authorization and an audit event.
- Claim, merge, status transition, and primary-solution selection must use database concurrency protection and produce audit records.
- Do not physically delete demands, discussions, reports, or links; use state transitions and audit metadata.
- Do not introduce Redis, Elasticsearch, message queues, Kubernetes, microservices, or a public Open API.
- Phase 6 analytics dashboards, exports, external Dify assistant, and metric dictionary are deferred.
- Do not change completed Phase 4 business semantics; extensions require a new migration and focused tests.
- The formal application-publishing path must delegate to the existing Phase 3 `ApplicationService` and may not directly set an application to `published`.

## Phase 5 Baseline

- Base branch: `feature/phase-04-market-search-interaction`.
- Base commit: `f60def66699bfbb0192b60fa1d256d98159d198b`.
- New branch: `feature/phase-05-ai-demand-innovation`.
- Phase 3 gate evidence remains accepted from Codex session `019fc537-5ae6-7f42-bb49-ff0fc969afac`; it is not repeated here.
- Existing untracked `.codex/` is user-owned workspace state and remains excluded from staging.
- Phase 4 evidence is consumed from its plan, execution ledger, ADR 0005, and remote branch; no Phase 4 full gate is repeated before Phase 5.

## File Structure

```text
packages/contracts/src/demand.ts
packages/contracts/src/index.ts
packages/database/src/schema.ts
packages/database/src/migrate.ts
packages/database/src/migrations/0006_ai_demand_innovation.ts
packages/server/src/demand/demand.tokens.ts
packages/server/src/demand/demand.types.ts
packages/server/src/demand/demand.repository.ts
packages/server/src/demand/demand.service.ts
packages/server/src/demand/demand.service.test.ts
packages/server/src/demand/demand.controller.ts
packages/server/src/demand/demand.module.ts
packages/server/src/index.ts
packages/server/src/application/application.service.ts
packages/server/src/application/application.types.ts
packages/server/src/application/application.repository.ts
apps/api/src/api.module.ts
apps/api/test/phase5.e2e-spec.ts
apps/api/test/phase5.real.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/phase5.test.tsx
apps/web/src/app/App.tsx
docs/adr/0006-phase-05-ai-demand-innovation.md
docs/superpowers/plans/2026-08-03-ai-hub-phase-05-execution-ledger.md
processing_visualization.html
```

## Stable Interfaces

```ts
export type DemandStatus =
  | "draft" | "pending_review" | "rejected" | "published"
  | "in_progress" | "pilot" | "completed" | "closed" | "merged";
export type DemandAudienceType = "all" | "department" | "employee";
export type DemandCollaboratorRole = "owner" | "collaborator" | "operator";
export type DemandApplicationRole = "candidate" | "pilot" | "solution";

export interface CreateDemandInput {
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  audienceType: DemandAudienceType;
  departmentId?: string;
  employeeId?: string;
  includeChildren?: boolean;
  displayAnonymously?: boolean;
}

export interface DemandPriorityInput {
  businessValue: number;
  implementationCost: number;
  riskLevel: number;
  adminPriority: number;
}

export interface DemandEntry {
  demandId: string;
  requesterEmployeeId?: string;
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  status: DemandStatus;
  audienceType: DemandAudienceType;
  audienceDepartmentId: string | null;
  displayAnonymously: boolean;
  likeCount: number;
  commentCount: number;
  priorityScore: number | null;
  priorityExplanation: string | null;
  ownerEmployeeId: string | null;
  primarySolutionApplicationId: string | null;
  version: number;
}

export interface DemandRepository {
  withTransaction<T>(operation: (repository: DemandRepository) => Promise<T>): Promise<T>;
  createDemand(input: CreateDemandInput & { requesterEmployeeId: string }): Promise<DemandEntry>;
  saveDraft(actor: ActorContext, demandId: string, input: Partial<CreateDemandInput>): Promise<DemandEntry>;
  submitForReview(actor: ActorContext, demandId: string): Promise<DemandEntry>;
  review(actor: ActorContext, demandId: string, decision: "publish" | "reject", reason?: string): Promise<DemandEntry>;
  listVisible(actor: ActorContext, filters: { status?: DemandStatus; query?: string }): Promise<readonly DemandEntry[]>;
  findVisible(actor: ActorContext, demandId: string): Promise<DemandEntry | null>;
}
```

## Ordered Tasks

### Task 1: Phase 5 baseline, plan, ledger, ADR, and visualization

**Files:** this plan, execution ledger, ADR 0006, `processing_visualization.html`.

- [x] Verify the current branch, exact Phase 4 commit, remote tracking branch, clean tracked status, and preserved `.codex/` state.
- [x] Create `feature/phase-05-ai-demand-innovation` from the Phase 4 branch.
- [x] Record the accepted baseline and explicit Phase 4/6 boundaries in the ledger and ADR.
- [x] Update the visualization with an in-progress Phase 5 task and baseline event.
- [x] Run `git diff --check`, then commit `docs(phase-05): establish AI demand innovation plan`.

### Task 2: Contracts, migration, state model, audience and audit boundaries

**Files:** `packages/contracts/src/demand.ts`, contracts index, database schema/migrator, migration `0006`, demand types/repository scaffolding, migration test.

- [x] Write a failing migration test for normalized demands, audience checks, append-only discussion/report/link tables, unique likes/collaborators, optimistic version, partial unique primary solution, audit, outbox, and absence of `tenant_id`.
- [x] Run the focused test and observe failure because `0006` is absent (after enabling the recorded Docker Desktop engine, assertions failed on missing tables/constraints/triggers).
- [x] Implement the migration with check constraints, foreign keys, indexes, optimistic version column, and a trigger preventing physical deletes from demand content tables.
- [x] Add contracts and Kysely schema types; register `0006`.
- [x] Run the focused PostgreSQL migration test and commit `feat(phase-05): add demand contracts and schema`.

### Task 3: Demand creation, drafts, lightweight review and rejection

**Files:** demand service/repository/controller/module, service tests, API test, server export.

- [x] Write failing tests for required-field validation, draft save/resume, submit-for-review, reviewer-only decision, rejection reason, immutable requester identity, and transactional audit/outbox.
- [x] Run the service test red.
- [x] Implement minimal validation and state transitions: `draft -> pending_review -> published|rejected`, with reviewer authorization and no physical delete.
- [x] Run focused service/API tests, update the ledger, and commit `feat(phase-05): add governed demand submission`.

### Task 4: Demand list/detail, audience filtering, anonymous display, likes, discussion and reports

**Files:** repository/service/controller, interaction contracts if needed, service tests, API/Web tests, router/App.

- [x] Write failing tests proving list/search/detail filter before pagination for all/department/employee audiences, and ordinary readers cannot see requester identity when anonymous.
- [x] Write failing tests for idempotent like/unlike, append-only one-level discussion, hidden-content filtering, report creation, moderation hide/restore, and authorized anonymous identity lookup audit.
- [x] Implement the read and write paths with the same audience semantics as Phase 4 catalog reads; preserve identity in storage and reject physical delete.
- [x] Add innovation-square and demand-detail routes with loading, empty, rejected, hidden, and closed states.
- [x] Run focused server/API/Web tests and commit `feat(phase-05): add demand square interactions`.

### Task 5: Claim, owner, collaborators, operator selection and concurrency protection

**Files:** demand repository/service/controller/tests, migration constraints if needed, API e2e.

- [x] Write failing tests for first-writer-wins claim, owner-only collaborator changes, operator assignment, duplicate collaborator rejection, stale-version conflict, and audit/outbox for every assignment.
- [x] Run tests red.
- [x] Implement atomic `UPDATE ... WHERE version = expectedVersion`/unique constraints and return `DEMAND_CONFLICT` on lost update.
- [x] Run focused tests and commit `feat(phase-05): protect demand ownership concurrency`.

### Task 6: Value/cost/risk/priority scoring and administrator audit

**Files:** contracts, schema/repository/service/controller/tests, Web priority view.

- [x] Write failing tests for 1-5 bounded inputs, deterministic explainable score, admin-only changes, audit details, and stable ordering with ID tie-breaker.
- [x] Implement a documented score formula, persist the inputs and explanation, and expose only authorized priority data.
- [x] Run focused tests and commit `feat(phase-05): add explainable demand prioritization`.

### Task 7: Status progression, official progress, pilot and close

**Files:** demand state service/repository/controller, tests, API/Web routes.

- [x] Write failing tests for the allowed state graph, invalid transition rejection, official progress authorization, pilot dates/outcomes, close reason, and append-only state/progress audit.
- [x] Implement state transitions under optimistic concurrency; every transition emits an outbox event and audit row.
- [x] Run focused tests and commit `feat(phase-05): add demand progress and pilot lifecycle`.

### Task 8: Merge, many-to-many application links, primary solution and formal application listing

**Files:** application bridge contracts/service, demand repository/service/controller, migration extensions only if required, tests, API e2e.

- [x] Write failing tests for merge conflict protection, merged-demand visibility, many-to-many links, one primary solution, link role authorization, and link audit.
- [x] Write a failing integration test that creates a formal application from a demand and proves publication still requires artifact verification, review, and the Phase 3 publish guard.
- [x] Implement `createApplicationFromDemand` as a transactionally audited bridge that creates an application draft through the existing application service and never directly updates `applications.status` to `published`.
- [x] Run focused service/API and PostgreSQL e2e tests and commit `feat(phase-05): close demand to application loop`.

### Task 9: API/Web e2e, PostgreSQL verification, full gates and two-axis review

**Files:** Phase 5 API real e2e, Web tests, ledger, ADR, visualization, review notes.

- [ ] Run the focused service/API/Web tests and real PostgreSQL e2e for audience, moderation, concurrency, merge, audit, outbox, and application lifecycle gates.
- [ ] Run exactly the Phase 5 final gate commands: format, lint, typecheck, boundaries, full test, build, doc links, and Compose config.
- [ ] Review `git diff f60def66699bfbb0192b60fa1d256d98159d198b..HEAD` on standards and spec axes; resolve actionable findings.
- [ ] Record exact counts, skipped external capabilities, and any environmental blockers in the ledger; update visualization.
- [ ] Commit `docs(phase-05): close AI demand innovation gates`.

### Task 10: GitHub handoff

**Files:** none beyond closeout docs if GitHub metadata requires a factual update.

- [ ] Verify status, branch, commit ancestry, and remote URL.
- [ ] Push `feature/phase-05-ai-demand-innovation` without force push.
- [ ] Create or update a Draft PR if write permission and connector support are available; otherwise record the exact permission blocker and report it as incomplete.

## Phase 5 Gate

Phase 5 may be called complete only when the demand-to-formal-application path is proven without bypassing Phase 3 gates; merge, claim, status transition, and primary solution selection have concurrency protection and audit; anonymous and audience behavior matches the application side; PostgreSQL/API/Web tests and every final gate command pass; two-axis review has no unresolved actionable findings; the branch is committed and pushed; and a Draft PR exists or the external permission blocker is explicitly recorded as incomplete.
