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
| Ownership/priority/progress | Ownership, priority, and progress: server 66/66; Docker-backed API 8 files/16 tests; PostgreSQL schema 3/3 plus outbox 15/15 | passed |
| Merge/application loop | Server 68/68; focused mock API demand suite 1/1; Docker-backed Phase 5 real API 3/3 and existing application lifecycle 3/3 | passed |
| PostgreSQL/API/Web evidence | Docker-backed Phase 5 real API 3/3; application lifecycle 3/3; Web 17/17; full workspace test 17 API tests, 68 server tests, 18 database tests | passed |
| Final gates/two-axis review | All required final commands passed; two-axis review completed after closeout | passed |
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
- Commit: `76cc835 docs(phase-05): establish AI demand innovation plan`.

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
- Commit: `9c369aa feat(phase-05): add governed demand submission`.

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
- Commit: `02ee2c0 feat(phase-05): add demand square interactions`.

### Step 5: Claim, owner, collaborators, operator selection, and concurrency

- RED: service tests initially failed because `claim` and
  `addCollaborator` were absent; the API contract test then failed with 404
  until claim/collaborator routes were added; the schema integration test
  failed because the one-operator index was absent; the collaborator-list
  test exposed the missing read path before it was implemented. A no-Docker
  API attempt is recorded only as a runtime blocker, not as pass evidence.
- GREEN: `corepack pnpm --filter @ai-hub/server typecheck` passed and the
  focused server command passed 64/64 workspace tests; `corepack pnpm
  --filter @ai-hub/api typecheck` passed; Docker-backed API tests passed 8
  files/16 tests, including two real Phase 5 tests proving one concurrent
  claim winner and one operator assignment; and the Docker-backed database
  command passed 3 demand-schema tests plus 15 outbox tests.
- Implementation: added optimistic owner claim, owner-only collaborator and
  operator assignment, unique collaborator conflict mapping, collaborator
  listing, transactionally paired Audit/Outbox events, and migration `0007`
  with a partial unique operator index. Claim and assignment both update the
  demand version conditionally, so stale writers fail with `DEMAND_CONFLICT`.
- Commit: `17c0831 feat(phase-05): protect demand ownership concurrency`.

### Step 6: Explainable value/cost/risk/admin priority and ordering

- RED: the new priority service test failed because `setPriority` was absent.
  The contract test then required an explicit API route and list sort path.
- GREEN: `corepack pnpm --filter @ai-hub/server typecheck` passed and the
  focused server command passed 65/65 workspace tests; `corepack pnpm
  --filter @ai-hub/api typecheck` passed; Docker-backed API tests passed 8
  files/16 tests, including admin priority persistence and `sort=priority`;
  and the real PostgreSQL path passed with the existing schema/outbox evidence.
- Implementation: inputs are integer bounded 1..5; the fixed explainable
  score is `3*businessValue + 2*adminPriority - 2*implementationCost -
  2*riskLevel`; the explanation is persisted and audited, optimistic version
  protects updates, and only `demand_operator`/`super_admin` can write or
  request priority ordering. PostgreSQL ordering uses score descending,
  created time descending, and demand ID ascending as the deterministic tie
  breaker.
- Commit: `3c2ca1c feat(phase-05): add explainable demand prioritization`.

### Step 7: Status progression, official progress, pilot, and close

- RED: the progress service test initially failed because `advanceStatus`
  was absent. The API contract then exercised status, progress, pilot create,
  and pilot update routes.
- GREEN: `corepack pnpm --filter @ai-hub/server typecheck` passed and the
  focused server command passed 66/66 workspace tests; `corepack pnpm
  --filter @ai-hub/api typecheck` passed; Docker-backed API tests passed 8
  files/16 tests, including real PostgreSQL status progression, official
  progress, pilot dates/update, and close reason paths.
- Implementation: explicit status graph prevents backward/terminal rewrites;
  status changes use the existing optimistic version transition, progress is
  append-only, pilot records retain outcome/status history fields, and every
  state/progress/pilot mutation emits Audit and Outbox entries in the same
  transaction. Closing requires a reason.
- Commit: `c2e58c0 feat(phase-05): add demand progress and pilot lifecycle`.

### Step 8: Merge, application links, primary solution, and formal application bridge

- RED: the new service test initially failed because
  `createApplicationFromDemand` was absent. The API contract then required
  the merge, many-to-many link, application-list, and bridge routes.
- GREEN: `corepack pnpm --filter @ai-hub/server typecheck` and
  `corepack pnpm --filter @ai-hub/api typecheck` passed; the focused server
  command passed 68/68 tests; the focused mock API demand suite passed 1/1;
  Docker-backed `phase5.real.e2e-spec.ts` passed 3/3 tests; and the existing
  Docker-backed `application.real.e2e-spec.ts` passed 3/3 tests.
- Implementation: merge uses conditional source and target version updates;
  application links are many-to-many with a database-enforced primary
  solution invariant and deterministic listing; every merge/link mutation
  records Audit and Outbox in the demand transaction. The bridge now shares
  one PostgreSQL transaction across application draft creation, demand
  association, version updates, and both modules' Audit/Outbox records. A
  primary solution requires the linked application to already be published;
  existing candidate links can be promoted after the Phase 3 lifecycle gate.
  Department audiences with `includeChildren` use the department hierarchy
  recursively before pagination/detail/action visibility checks. The real e2e
  completes artifact verification, all four delivery channels, review, and
  publication through the existing Phase 3 application routes; the demand
  service never writes application publication state directly.
- Commits: `36ebf76 feat(phase-05): close demand to application loop`,
  `ff90b75 fix(phase-05): make application bridge atomic`,
  `2df8a63 fix(phase-05): honor hierarchical demand audiences`, and
  `5e4fe9e fix(phase-05): gate primary solutions on publication`.

### Step 9: Final gates and two-axis review

- Focused evidence: `corepack pnpm --filter @ai-hub/server test --
  src/demand/demand.service.test.ts` passed 68/68; the API demand contract
  passed 1/1; Docker-backed `phase5.real.e2e-spec.ts` passed 3/3 and the
  existing `application.real.e2e-spec.ts` passed 3/3. The Web focused suite
  passed 17/17.
- Final gate commands all exited 0:
  `corepack pnpm format:check`, `corepack pnpm lint`,
  `corepack pnpm typecheck`, `corepack pnpm boundaries`,
  `corepack pnpm test`, `corepack pnpm build`,
  `node scripts/verify-doc-links.mjs`, and
  `docker compose -f compose.yaml -f compose.test.yaml config --quiet`.
  The Compose command emitted only a local Docker config permission warning
  and returned `exit=0`.
- Full test evidence included API 8 files/17 tests, server 14 files/68
  tests, database 2 files/18 tests, Web 3 files/17 tests, worker 3 files/5
  tests, and the repository Node checks 8/8.
- Two-axis review was run against
  `f60def66699bfbb0192b60fa1d256d98159d198b` over the complete non-empty
  branch diff. Findings and dispositions are recorded in the closeout notes
  below; no unresolved actionable finding remains.

#### Two-axis review dispositions

- Standards axis: the only hard finding was the non-atomic application
  bridge; fixed in `ff90b75`. The reported divergent-change, duplicated
  transaction orchestration, and controller input data-clump items are
  documented Fowler smell judgement calls, not gate-blocking violations.
- Spec axis: the non-atomic bridge was fixed in `ff90b75`; hierarchical
  `includeChildren` audience visibility was implemented and covered by real
  PostgreSQL e2e in `2df8a63`; draft applications cannot be selected as the
  primary solution and existing links can be promoted after publication in
  `5e4fe9e`. No scope-creep finding remained.
