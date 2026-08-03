# AI Hub Phase 4 Market, Search, Interaction and Creator Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Phase 4 application market, permission-filtered search, detail and delivery analytics, interaction governance, notification center, health labels, and creator-center read models on top of the Phase 3 application lifecycle.

**Architecture:** Add bounded `catalog`, `interaction`, `notification`, and `creator` modules under `packages/server`, backed by PostgreSQL migrations `0004` and `0005` and stable contracts. Catalog queries apply audience authorization in the database query path before ranking; interactions and notifications write audit/outbox records transactionally; creator data is aggregate-only and never exposes individual access lists. The API exposes protected routes and the Web shell consumes read models without duplicating authorization rules.

**Tech Stack:** Node.js >=18.18, TypeScript strict mode, NestJS, Kysely, PostgreSQL, Vitest, Supertest, React/Vite/Ant Design, existing Outbox and ActorContext boundaries.

## Global Constraints

- Phase 3 gate evidence is accepted from session `019fc537-5ae6-7f42-bb49-ff0fc969afac`; do not rerun the full Phase 3 gate as a prerequisite.
- Preserve the single-enterprise model; do not add `tenant_id`.
- Do not introduce Redis, Elasticsearch, a message queue, Kubernetes, public Open API, or microservices.
- All catalog list, search, recommendation, detail, Dify-facing, export, and download reads must filter by the current employee's application audience before returning rows.
- V1 uses fixed operational ordering; it does not implement personalized recommendations or independent favorites.
- Versions and approved public content remain immutable; Phase 4 may add read models and event records but may not weaken Phase 3 lifecycle guards.
- Anonymous display never removes the real employee identity from audit records; anonymous identity lookup requires a dedicated super-admin authorization decision and is itself audited.
- External DingTalk delivery failures do not roll back successful business operations; notification delivery uses idempotency keys, retry state, and failure visibility.
- Creator and application-team analytics expose aggregates only, never individual visitor/access lists.
- All state-changing writes use the existing transaction, audit, and outbox boundaries.

## Phase 4 Baseline

- Base commit/tag: `phase-03-complete` / `978612d5ae8f125f4e328186d59257ff6dd7011e`.
- Branch: `feature/phase-04-market-search-interaction`.
- Phase 3 gate result: accepted from the referenced Codex session; this plan intentionally does not repeat that gate.
- Existing untracked `.codex/` is user-owned workspace state and is excluded from staging.
- Current Phase 3 public interfaces consumed: `ActorContext`, `AuthorizationRequest`, `AuthorizationDecision`, `ApplicationRepository`, application lifecycle, delivery records, audit events, and transactional outbox.

## File Structure

Create or modify only the following areas:

```text
packages/contracts/src/catalog.ts
packages/contracts/src/interaction.ts
packages/contracts/src/notification.ts
packages/contracts/src/index.ts
packages/database/src/schema.ts
packages/database/src/migrations/0004_catalog_interaction.ts
packages/database/src/migrations/0005_notification_creator.ts
packages/server/src/catalog/catalog.types.ts
packages/server/src/catalog/catalog.repository.ts
packages/server/src/catalog/catalog.service.ts
packages/server/src/catalog/catalog.service.test.ts
packages/server/src/catalog/catalog.controller.ts
packages/server/src/catalog/catalog.module.ts
packages/server/src/interaction/interaction.types.ts
packages/server/src/interaction/interaction.repository.ts
packages/server/src/interaction/interaction.service.ts
packages/server/src/interaction/interaction.service.test.ts
packages/server/src/interaction/interaction.controller.ts
packages/server/src/interaction/interaction.module.ts
packages/server/src/notification/notification.types.ts
packages/server/src/notification/notification.repository.ts
packages/server/src/notification/notification.service.ts
packages/server/src/notification/notification.service.test.ts
packages/server/src/notification/dingtalk.port.ts
packages/server/src/notification/notification.controller.ts
packages/server/src/notification/notification.module.ts
packages/server/src/creator/creator.types.ts
packages/server/src/creator/creator.repository.ts
packages/server/src/creator/creator.service.ts
packages/server/src/creator/creator.service.test.ts
packages/server/src/creator/creator.controller.ts
packages/server/src/creator/creator.module.ts
packages/server/src/index.ts
apps/api/src/api.module.ts
apps/api/test/phase4.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/App.tsx
apps/web/src/app/phase4.test.tsx
docs/adr/0005-phase-04-catalog-interaction-notification.md
docs/superpowers/plans/2026-08-03-ai-hub-phase-04-execution-ledger.md
processing_visualization.html
```

## Stable Interfaces

```ts
export type CatalogSort = "recommended" | "latest" | "popular";
export type TrustLabel = "experimental" | "verified" | "recommended" | "deprecated";

export interface CatalogQuery {
  actor: ActorContext;
  query?: string;
  categoryId?: string;
  tagIds?: readonly string[];
  applicationType?: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}

export interface CatalogEntry {
  applicationId: string;
  name: string;
  summary: string;
  departmentId: string;
  categoryId: string;
  tagIds: readonly string[];
  trustLabels: readonly TrustLabel[];
  currentVersionId: string;
  publishedAt: Date;
  deliveryChannels: readonly DeliveryChannel[];
  likeCount: number;
  ratingAverage: number | null;
}

export interface NotificationRecord {
  notificationId: string;
  recipientEmployeeId: string;
  eventType: string;
  idempotencyKey: string;
  readAt: Date | null;
  createdAt: Date;
}
```

## Ordered Tasks

### Task 1: Contracts and catalog schema

**Files:** contracts catalog types; database schema; migration `0004`; migration registration; schema integration test.

- [ ] Write failing assertions for audience rows, categories, tags, application-tag links, catalog labels, normalized search fields, publication visibility, unique employee/application interactions, and no `tenant_id`.
- [ ] Run the focused schema test and confirm it fails because the Phase 4 tables are absent.
- [ ] Implement the normalized tables, foreign keys, unique constraints, indexes, check constraints, and Kysely interfaces. Store search text, pinyin, and initials as explicit indexed fields; do not hide typed catalog data in a large JSON column.
- [ ] Run the focused migration/schema test and confirm it passes against PostgreSQL.
- [ ] Commit `feat(phase-04): add catalog contracts and schema`.

### Task 2: Permission-filtered catalog, search, ranking, and detail

**Files:** catalog module files; server exports; API module; catalog unit tests.

- [ ] Write failing tests proving an employee outside an audience receives no list/search/recommendation/detail result, while a department member receives the permitted application.
- [ ] Write failing tests for exact name, name prefix, tag/category, summary fuzzy matching, pinyin/initial matching, fixed recommended/latest/popular ordering, pagination, and deprecated-label visibility.
- [ ] Implement `CatalogService.list`, `CatalogService.search`, `CatalogService.getDetail`, and `CatalogService.recordDeliveryAction` through a repository query that applies audience predicates before sorting and pagination.
- [ ] Use a deterministic pinyin/initial normalizer at write time and PostgreSQL indexed matching at read time; avoid an Elasticsearch dependency.
- [ ] Run catalog unit tests, database typecheck, server typecheck, and lint.
- [ ] Commit `feat(phase-04): add permission-filtered catalog search`.

### Task 3: Detail, delivery actions, health and trust labels

**Files:** catalog contracts/repository/service; database migration extension; API e2e tests; ADR.

- [ ] Write failing tests for published-version-only detail, blocked unpublished artifact download, four-channel action metrics, health-check state, deprecated replacement text, and aggregate-only creator metrics.
- [ ] Implement version/risk/delivery snapshots, `web_redirect`, `package_download`, and `mini_program_qr` action events, plus fixed health/trust/deprecation labels.
- [ ] Keep download authorization and publication checks in the server service before any delivery URL is returned.
- [ ] Run focused API/database tests and commit `feat(phase-04): add delivery metrics and trust labels`.

### Task 4: Likes, ratings, replies, reports, hiding, and anonymous audit

**Files:** interaction contracts; migration extension; interaction module; interaction tests; API e2e tests.

- [ ] Write failing tests for like/unlike idempotency, one rating per employee/application, 1–5 star validation, editable reviews, version-at-review capture, one-level replies, official-reply authorization, report creation, moderation hide/restore, disabled-user display, and physical-delete rejection.
- [ ] Write failing tests proving anonymous display hides identity from ordinary readers and that super-admin identity lookup creates an audit event.
- [ ] Implement transaction-aware interaction repository methods and enforce authorization through `ActorContext` and object relationships.
- [ ] Keep reports non-destructive; hide content with state and audit metadata rather than deleting rows.
- [ ] Run focused interaction tests and commit `feat(phase-04): add governed application interactions`.

### Task 5: In-app notifications and DingTalk retry

**Files:** notification contracts; migration `0005`; notification module; DingTalk adapter port; notification tests; API e2e tests.

- [ ] Write failing tests for notification creation from application/review/withdrawal/report events, idempotent duplicate delivery, read/unread state, retry backoff state, and external failure not rolling back the business transaction.
- [ ] Implement `NotificationService.createForEvent`, `markRead`, and `retryDelivery` with a durable in-app record, outbox idempotency key, and `DingTalkNotificationPort`.
- [ ] Keep external transport behind the port; the deterministic test adapter records attempts without requiring real DingTalk credentials.
- [ ] Run focused notification tests and commit `feat(phase-04): add notification center and retry state`.

### Task 6: Creator center aggregates and Web surface

**Files:** creator module; Web router/App; Web tests; API e2e tests.

- [ ] Write failing tests for version diff, validation-report display, one-application aggregate metrics, owner/maintainer authorization, and rejection of visitor-list queries.
- [ ] Implement creator read models using aggregate SQL only; do not return employee-level access records.
- [ ] Add accessible Web routes and states for market, search, detail, interactions, notifications, and creator center. Keep the Web shell read/write boundaries explicit and show loading, empty, error, withdrawn, archived, and deprecated states.
- [ ] Run focused Web tests, API e2e, and build.
- [ ] Commit `feat(phase-04): add creator center and market UI routes`.

### Task 7: Closeout ledger, review, and gates

**Files:** Phase 4 ledger; ADR 0005; processing visualization; any test corrections.

- [ ] Record the accepted Phase 3 baseline, each Phase 4 commit, test evidence, deferred external DingTalk credentials, and remaining Phase 5 boundary.
- [ ] Update the processing visualization with factual Phase 4 progress, problems, solutions, and skipped items.
- [ ] Run fresh Phase 4 focused tests plus the project's full verification commands: `corepack pnpm format:check`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm boundaries`, `corepack pnpm test`, `corepack pnpm build`, `node scripts/verify-doc-links.mjs`, and `docker compose -f compose.yaml -f compose.test.yaml config --quiet`.
- [ ] Review `git diff phase-03-complete...HEAD` on standards and spec axes; resolve all actionable findings.
- [ ] Commit `docs(phase-04): close market and interaction gates`.
- [ ] Push the phase branch and create the GitHub draft PR if GitHub authentication/connector support is available; otherwise report the exact external blocker without force-pushing.

## Phase 4 Gate

Phase 4 may be called complete only when the accepted Phase 3 baseline is recorded, the Phase 4 focused PostgreSQL/API/Web tests pass, permission filtering is proven for list/search/recommendation/detail/download, interaction and anonymous-audit tests pass, notification idempotency/retry tests pass, creator metrics are aggregate-only, all listed quality gates exit 0, the two-axis review has no unresolved actionable findings, and the branch is committed and pushed.

