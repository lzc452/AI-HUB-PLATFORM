# AI Hub Phase 3 Application Delivery Review Implementation Plan

Status: Completed and superseded for closeout tracking by `2026-08-03-ai-hub-phase-03-closeout.md`.

Phase 3 completion decisions: ownership fields are included; four-channel end-to-end publication is a hard gate; review pool, claim/release, SLA, and notification outbox events are the minimum scope. External notification delivery and a full review-operations UI remain deferred.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Phase 3 application, immutable version, four-channel delivery, artifact security, publication, review, audit, and rollback baseline required by the V1 roadmap.

**Architecture:** Add a deep `application` module in `packages/server` backed by Kysely tables and stable contracts. State changes use one transaction boundary that writes application audit and outbox records. Artifact handling is behind storage, malware-scan, signature, and hash ports; deterministic memory adapters make the core testable while Garage/ClamAV remain deployment adapters. Version and review transitions reject invalid state changes before persistence.

**Tech Stack:** Node.js >=18.18, TypeScript strict mode, NestJS 10, Kysely, PostgreSQL 18, Vitest, React/Vite/Ant Design, Garage-compatible S3 port, ClamAV-compatible scanner port.

## Global Constraints

- Single enterprise, single instance; do not introduce `tenant_id`.
- Phase 2 `ActorContext`, `AuthorizationRequest`, and `AuthorizationDecision` are the only authorization boundary consumed by Phase 3.
- Application versions are immutable after creation; edits create a new version.
- Failed scans or invalid signatures cannot enter manual review or publication.
- Approved applications cannot be physically deleted; withdrawal and archive are separate states.
- Every state-changing application operation writes audit and outbox records in the same PostgreSQL transaction.
- Web, desktop, mobile, and mini-program delivery configurations remain separate.
- V1 adds no Redis, message queue, Elasticsearch, Kubernetes, public Open API, or microservices.

---

## File Structure

```text
packages/contracts/src/application.ts
packages/contracts/src/index.ts
packages/database/src/migrations/0003_application_delivery_review.ts
packages/database/src/migrate.ts
packages/database/src/schema.ts
packages/server/src/application/application.types.ts
packages/server/src/application/application.repository.ts
packages/server/src/application/application.service.ts
packages/server/src/application/application.service.test.ts
packages/server/src/application/application.controller.ts
packages/server/src/application/application.module.ts
packages/server/src/application/storage.port.ts
packages/server/src/application/storage.memory.ts
packages/server/src/application/storage.pipeline.ts
packages/server/src/application/storage.pipeline.test.ts
packages/server/src/index.ts
apps/api/src/api.module.ts
apps/api/test/application.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/App.test.tsx
docs/adr/0004-application-version-release-review.md
processing_visualization.html
```

## Stable Interfaces

```ts
export type ApplicationId = string;
export type ApplicationVersionId = string;
export type DeliveryChannel = "web" | "desktop" | "mobile" | "mini_program";
export type ApplicationStatus = "draft" | "in_review" | "approved" | "published" | "withdrawn" | "archived";

export interface ApplicationVersionInput {
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string;
  scanStatus: "passed";
}

export interface DeliveryConfig {
  channel: DeliveryChannel;
  entryUrl: string;
  minClientVersion?: string;
  enabled: boolean;
}
```

## Task 1: Contracts and Database Baseline

**Files:** contracts application types; migration `0003`; database schema/registry; database integration test.

- [ ] Add failing schema assertions for applications, versions, four delivery channels, reviews, audit records, uniqueness, status checks, immutable artifact fields, and no `tenant_id`.
- [ ] Run the integration test and confirm failure because migration `0003` is absent.
- [ ] Implement the migration, Kysely interfaces, migration registration, and contract exports.
- [ ] Run the same integration test with Docker Desktop and confirm all schema assertions pass.
- [ ] Run database/contracts typecheck, lint, and format checks.

## Task 2: Application/Version/Release State Machine

**Files:** `packages/server/src/application/application.types.ts`, repository port, service, tests, server exports.

- [ ] Add failing tests for immutable versions, duplicate version rejection, legal draft → review → approved → published → withdrawn → archived transitions, self-review rejection, publication-before-approval rejection, and physical-delete rejection.
- [ ] Run the focused test and confirm the service is missing.
- [ ] Implement the repository port, transaction-aware service, authorization call, audit/outbox emission, and in-memory test repository.
- [ ] Run focused tests, server typecheck, and server lint.

## Task 3: Artifact Security Pipeline

**Files:** storage/hash/scan/signature ports, memory storage adapter, pipeline, pipeline tests; extend service only after pipeline is green.

- [ ] Add failing tests for missing/duplicate chunks, digest mismatch, malware rejection, invalid signature, and successful temp-to-final copy.
- [ ] Run them and confirm the pipeline is absent.
- [ ] Implement ordered chunk assembly, SHA-256 verification, scanner and signature checks, failure cleanup, and final-key copy.
- [ ] Run focused pipeline tests, server typecheck, and lint.

## Task 4: API and Delivery Configurations

**Files:** application controller/module, API module, API e2e test.

- [ ] Add failing API tests for create application, version metadata, all four delivery channels, protected review, publish, withdraw, archive, published-version lookup, and generic authorization denial.
- [ ] Run the API e2e test and confirm routes are absent.
- [ ] Register the module with the Phase 2 database/identity services and implement ProblemDetails-compatible routes.
- [ ] Re-run API e2e plus API typecheck/lint/tests.

## Task 5: Web Administration Surface

**Files:** `apps/web/src/app/router.tsx`, `apps/web/src/app/App.test.tsx`, shared styles only when required.

- [ ] Add failing UI tests for application, version, review, and delivery navigation and lifecycle labels.
- [ ] Implement accessible loading, empty, rejected, withdrawn, archived, and published states without business writes in the shell.
- [ ] Run focused UI tests, lint, typecheck, and Vite build.

## Task 6: Final Gate and Project Memory

**Files:** API/database end-to-end additions, ADR 0004, `processing_visualization.html`.

- [ ] Add failing assertions for scan/signature rejection, approval immutability, old-version availability, rollback, and archive/physical-delete boundaries.
- [ ] Implement only missing integration behavior and document the state machine and external credential risks.
- [ ] Run fresh uncached server/API/database tests with Docker/Testcontainers.
- [ ] Update processing visualization with Phase 2 gate evidence and factual Phase 3 events, progress, problems, solutions, and skips.

## Final Phase 3 Gate

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm boundaries
corepack pnpm test
corepack pnpm build
node scripts/verify-doc-links.mjs
docker compose -f compose.yaml -f compose.test.yaml config --quiet
```

Fresh evidence must also include:

```powershell
& 'D:\HighPowerWorkspace\AI-HUB-PLATFORM\node_modules\.bin\vitest.cmd' run src/application/application.service.test.ts src/application/storage.pipeline.test.ts
& 'D:\HighPowerWorkspace\AI-HUB-PLATFORM\node_modules\.bin\vitest.cmd' run test/application.e2e-spec.ts
& 'D:\HighPowerWorkspace\AI-HUB-PLATFORM\node_modules\.bin\vitest.cmd' run src/outbox/outbox-store.integration.test.ts
```

Phase 3 opens only when every command exits 0, all API/database assertions pass, failed artifacts cannot reach review, approved applications cannot be physically deleted, older versions remain readable, and processing visualization records the evidence.
