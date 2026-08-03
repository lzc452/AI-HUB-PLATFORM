# Phase 5 Execution Ledger

Date: 2026-08-03

## Baseline decision

Phase 4 is accepted as the Phase 5 input from remote branch
`feature/phase-04-market-search-interaction` at commit
`f60def66699bfbb0192b60fa1d256d98159d198b`. Phase 3 evidence remains accepted
from Codex session `019fc537-5ae6-7f42-bb49-ff0fc969afac`. Phase 5 does not
rerun the Phase 3 or Phase 4 full gates before implementation.

The Phase 5 branch is `feature/phase-05-ai-demand-innovation`. Existing
untracked `.codex/` is user-owned workspace state and is excluded from
staging.

## Scope and non-goals

Phase 5 delivers structured AI demands, drafts, lightweight review, audience
filtering, anonymous presentation, likes, discussion, reports, claim/ownership,
collaborators, operator selection, explainable priority, state/progress/pilot/
close workflows, merge and application associations, primary solution, and a
formal application-listing bridge. Phase 6 dashboards, exports, Dify external
assistant, and metric dictionary remain explicitly deferred. Redis,
Elasticsearch, message queues, Kubernetes, microservices, public Open API,
physical deletes, and a new tenant model are prohibited.

## Ordered execution

1. Baseline, plan, ledger, ADR, visualization.
2. Contracts, migration, state/audience/audit boundaries.
3. Creation, drafts, lightweight review, rejection.
4. List/detail, audience and anonymous display, likes, discussion, reports.
5. Claim, owner, collaborators, operator selection, concurrency.
6. Value/cost/risk/admin priority and explainable ordering.
7. State progression, official progress, pilot, close.
8. Merge, many-to-many applications, primary solution, formal listing bridge.
9. API/Web/PostgreSQL e2e, final gates, two-axis review.
10. Commit, push, Draft PR handoff.

## Evidence log

| Gate | Evidence | Status |
|---|---|---|
| Phase 3 baseline | Codex session `019fc537-5ae6-7f42-bb49-ff0fc969afac` | accepted input |
| Phase 4 baseline | Remote branch at `f60def66699bfbb0192b60fa1d256d98159d198b` | accepted input |
| Phase 5 branch | `feature/phase-05-ai-demand-innovation` created from Phase 4 HEAD | recorded |
| Plan/ADR/ledger/visualization | Phase 5 baseline documents and dashboard entry; branch created from exact Phase 4 HEAD | passed |
| Contracts/schema | `@ai-hub/contracts` and `@ai-hub/database` typecheck passed; PostgreSQL migration test 3/3 and existing outbox 15/15 passed | passed |
| Demand lifecycle | Service 59/59 and API 14/14 focused package tests passed; protected create/submit/review routes covered | passed |
| Innovation interactions | Server 62/62; Web 17/17; Docker-backed API 8 files/15 tests; PostgreSQL schema 3/3 plus outbox 15/15 | passed |
| Ownership/priority/progress | Not run yet | pending |
| Merge/application loop | Not run yet | pending |
| PostgreSQL/API/Web evidence | Not run yet | pending |
| Final gates/two-axis review | Not run yet | pending |
| GitHub push/Draft PR | Not run yet | pending; external permission must be reported if blocked |

## Decisions and risks

- Application publication remains owned by the existing Phase 3 application
  service; the demand module can create and associate application work but
  cannot directly publish an application.
- Audience checks are performed before pagination and before detail or action
  responses. Anonymous flags affect presentation only.
- Optimistic version checks and unique/partial indexes protect claim, merge,
  status, and primary-solution races; rejected races are explicit conflicts.
- All non-destructive governance records remain queryable for authorized audit.
- Real external notification credentials and Phase 6 analytics remain deferred
  by scope, not treated as Phase 5 completion evidence.

## Per-step evidence

This section is updated after every ordered step with the exact test command,
result, commit, and any blocker. No step is marked passed from an unexecuted
or inferred result.

### Step 1: Baseline and planning

- Branch check: current Phase 4 HEAD was `f60def66699bfbb0192b60fa1d256d98159d198b` and tracked status was clean; `.codex/` remained untracked and excluded.
- Branch creation: `feature/phase-05-ai-demand-innovation` created from that HEAD.
- Documents: plan, ledger, ADR 0006, and `processing_visualization.html` updated.
- Verification: `git diff --check` and `corepack pnpm format:check` both exited 0.
- Commit: pending until the documentation files are staged and committed independently of `.codex/`.

### Step 2: Contracts, migration, and boundaries

- RED: with `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine`, the new
  migration test failed because all Phase 5 tables/constraints were absent;
  the initial no-engine attempt is recorded as an environment blocker.
- GREEN: `corepack pnpm --filter @ai-hub/contracts typecheck` exited 0;
  `corepack pnpm --filter @ai-hub/database typecheck` exited 0; and the focused
  PostgreSQL command exited 0 with 3 demand-schema tests and 15 existing outbox
  integration tests passed.
- Schema: added migration `0006_ai_demand_innovation`, normalized lifecycle,
  audience, collaboration, comments, reports, progress, pilots, application
  links, audit, optimistic version, partial primary-solution index, demand
  likes, and non-destructive delete triggers. No `tenant_id` was added.
- Commit: `dba35ec feat(phase-05): add demand contracts and schema`; the omitted
  demand-like table was detected before Task 3 and is corrected in the next
  focused fix commit.

### Step 3: Demand creation, drafts, lightweight review, and rejection

- RED: service test initially failed because `demand.service.js` did not exist.
  The first implementation run also exposed an invalid `allowAll` reviewer
  fixture and exact-optional TypeScript errors; both were corrected.
- GREEN: `corepack pnpm --filter @ai-hub/server test --
  src/demand/demand.service.test.ts` passed 59/59 workspace server tests;
  `corepack pnpm --filter @ai-hub/server typecheck` exited 0;
  `corepack pnpm --filter @ai-hub/api typecheck` exited 0; and the Docker
  Desktop-backed API command passed 7 files/14 tests, including the new
  protected demand endpoint test and existing real application lifecycle.
- Implementation: added demand service/repository/controller/module, draft
  validation, requester/reviewer RBAC, optimistic status calls, transactionally
  paired audit/outbox calls, and API routes for create/save/submit/review.
- Commit: `7015c9c feat(phase-05): add governed demand submission`.

### Step 4: Demand list/detail, audience, anonymous display, interactions, and reports

- RED: the interaction service tests initially failed because the demand
  interaction methods and Web innovation route were absent. The moderation
  test then failed until reported comments were explicitly hidden/restored;
  the real API e2e exposed the need to keep reviewers inside the authorized
  audience and to allow like removal without a prohibited delete trigger.
- GREEN: `corepack pnpm --filter @ai-hub/server typecheck` and the focused
  server test passed with 62/62 workspace tests; `corepack pnpm --filter
  @ai-hub/api typecheck` passed; the Web typecheck passed and the focused Web
  suite passed 17/17; Docker-backed `phase5.real.e2e-spec.ts` passed 8 files /
  15 tests, including the existing application lifecycle e2e; and the
  Docker-backed schema command passed 3 demand-schema tests plus 15 outbox
  tests.
- Implementation: repository predicates apply audience filtering before
  pagination; anonymous identity is projected only at output and authorized
  lookup is audited; likes are idempotent, discussion is one-level and
  append-only, reports support hide/restore through `hidden_at`, and every
  mutation writes audit/outbox records transactionally. The likes table is
  intentionally removable because likes are reversible reactions and are not
  demand/discussion/report/link content covered by the no-physical-delete
  requirement.
- Commit: pending until the step changes and this evidence update are staged
  together as `feat(phase-05): add demand square interactions`.
