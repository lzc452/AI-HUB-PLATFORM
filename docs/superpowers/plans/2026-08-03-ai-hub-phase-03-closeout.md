# Phase 3 Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or inline TDD execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the approved Phase 3 gaps so application ownership, artifact verification, review operations, and four-channel publication are real protected workflows rather than isolated baselines.

**Status:** Completed. Final fresh workspace gate passed; local commit/tag is the archive boundary.

**Architecture:** Extend the existing application module and migration `0003` while Phase 3 is still uncommitted. The application service receives verified artifact evidence from the artifact pipeline, persists owner/maintainer/department fields, and records review-pool/SLA/notification state in the same transaction as audit and outbox events. The API e2e suite uses a real Nest module and real application service/repository against PostgreSQL; delivery channels are verified through independent published delivery records.

**Tech Stack:** TypeScript strict mode, NestJS 10, Kysely, PostgreSQL 18, Vitest, Supertest, React/Vite, Docker Desktop.

## Confirmed scope decisions

- Phase 3 includes `owner_employee_id`, `maintainer_employee_id`, and `department_id`.
- Web, desktop, mobile, and mini-program end-to-end publication is a Phase 3 gate.
- Review pool, claim/release, SLA timestamps/status, and Outbox notification events are the Phase 3 minimum review-operations scope. External notification delivery and a full operations UI are deferred.

## Global constraints

- Preserve the single-enterprise model; do not add `tenant_id`.
- Consume Phase 2 `ActorContext` and authorization only.
- A version cannot be persisted as reviewable or publishable unless the pipeline returns accepted verification evidence.
- All state-changing application, review-pool, SLA, delivery, and notification writes use one transaction boundary.
- Keep the four delivery channels independent.

## Ordered tasks

### Task 1: Ownership and artifact verification contract

- [x] Add failing service tests for maintainer/department persistence and rejection of unverified artifact evidence.
- [x] Add failing pipeline/service integration test proving only an accepted `ArtifactVerificationResult` can create a version.
- [x] Extend contracts, schema, migration, repository mappings, and service inputs.
- [x] Run focused tests, then server/database typecheck and lint.

### Task 2: Review pool and SLA minimum

- [x] Add failing service tests for pool entry, reviewer claim, claim release, self-claim rejection, SLA deadline, and notification outbox events.
- [x] Add review-pool table/schema/contracts and transaction-aware repository methods.
- [x] Implement protected service/API routes and deterministic SLA status calculation.
- [x] Run focused service/API tests and database schema integration.

### Task 3: Real lifecycle and four-channel API e2e

- [x] Add real application module/repository lifecycle assertions against PostgreSQL alongside the isolated contract test.
- [x] Add reviewer and owner identities, authorization denial, reject, approve, publish, withdraw, archive, rollback, and old-version-readability assertions.
- [x] Verify each delivery channel has an independently addressable entry and publication requires all four enabled records.
- [x] Run uncached API/database e2e tests.

### Task 4: Review and handoff

- [x] Update the Phase 3 plan checkboxes, execution ledger, ADR, and processing visualization with factual closeout evidence.
- [x] Run format, lint, typecheck, boundaries, tests, build, docs link validation, and compose config.
- [x] Perform diff review and commit/tag the Phase 3 closeout without pushing or merging unless separately authorized.
- [x] Record the Phase 4 entry decision and remaining deferred risks.

## Handoff decision

Phase 4 is open. The only explicit deferrals are deployment adapters for production artifact storage/scanning/signing, external notification delivery, and a dedicated review-operations UI; they are recorded risks, not Phase 3 gate failures under the confirmed minimum scope.
