# Phase 7 Production Security, Deployment, and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a deployable and auditable two-Ubuntu production Compose operating model with security controls, failure recovery evidence, and explicit proof of the 99.5% availability, 15-minute RPO, and 2-hour RTO targets without entering Phase 8 pilot or go-live work.

**Architecture:** Keep the existing single-enterprise modular monolith and its PostgreSQL, Outbox, Audit, authorization, and S3-compatible object-storage boundaries. Add a parameterized production Compose overlay for two independent Ubuntu hosts, internal-DNS health-based active-node switching, PostgreSQL primary/standby streaming replication plus WAL archive, asynchronous object replication, and an observability plane using Prometheus, Grafana, Alertmanager, and centralized logs. Production configuration is injected through validated environment files or host-mounted secrets; no secret fallback is allowed.

**Tech Stack:** Docker Compose, Ubuntu Server, PostgreSQL 18, Nginx, Garage/S3-compatible storage, Prometheus, Grafana, Alertmanager, Loki/Promtail, Node.js 24, pnpm 10.34.5, TypeScript, Vitest, Node test runner, GitHub Actions, GitLab CI, Trivy/Syft-compatible supply-chain checks.

## Global Constraints

- Continue the single-enterprise, single-instance model; do not add `tenant_id`.
- Do not introduce Redis, Elasticsearch, message queues, Kubernetes, or microservices.
- Do not add an unrestricted public Open API or change Phase 3–6 business semantics.
- Preserve ActorContext, RBAC, audience filtering, Audit, Outbox, migration, and rollback boundaries.
- Do not claim production readiness from local simulation, cached output, incomplete credentials, incomplete network configuration, or an undelivered drill.
- Keep Phase 8 pilot, UAT, formal go-live, and enterprise sign-off out of scope.
- Every production change gets a failing test or configuration-contract test, a minimal verification, an ADR/ledger entry, and an independent Conventional Commit.
- Reuse accepted Phase 3–6 evidence and run only necessary regression checks.

## Phase 7 baseline

- Base branch: `feature/phase-06-analytics-dashboard-export-assistant`.
- Base commit: `e8255b31949fead551fae4abd3ef94d1979d38c2`.
- New branch: `feature/phase-07-production-security-deployment-operations`.
- The local Phase 6 remote-tracking branch resolves to the same commit. A fresh `git ls-remote` was attempted and was blocked by the GitHub network endpoint returning an empty reply; this is recorded as external evidence uncertainty, not as a fabricated remote result.
- Existing untracked `.codex/` is user-owned workspace state and remains excluded from staging.
- Accepted Phase 6 evidence is consumed from its plan, execution ledger, ADR 0007, roadmap, and remote-tracking branch; Phase 3–6 full gates are not repeated.

## Ordered tasks

### Task 1: Phase 7 baseline, plan, ledger, ADR, and visualization

**Files:** Create this plan, `docs/superpowers/plans/2026-08-04-ai-hub-phase-07-execution-ledger.md`, `docs/adr/0008-phase-07-production-security-deployment-operations.md`; modify `processing_visualization.html`.

- [x] Record the exact Phase 6 base, new branch, status, remote evidence limitation, preserved `.codex/`, accepted evidence, scope, non-goals, and external prerequisites.
- [x] Record the ordered work matrix, target SLO/RPO/RTO, evidence policy, and Phase 8 deferrals in the ADR and visualization.
- [x] Run `git diff --check` and `corepack pnpm format:check`.
- [x] Commit `docs(phase-07): establish production operations baseline`.

### Task 2: Production Compose, configuration layering, secrets, and immutable images

**Files:** Create `compose.production.yaml`, `infra/production/*.env.example`, `infra/production/secrets/README.md`, `scripts/production/validate-config.mjs`, `scripts/production/validate-config.test.mjs`, `docs/runbooks/production-deploy.md`; modify `infra/docker/*.Dockerfile`, CI configuration, and workspace scripts only where required.

- [x] Write failing tests that reject development secret fallbacks, `latest` image tags, unpinned production image references, missing node role/configuration, host-published database/storage ports, and absent image digest evidence.
- [x] Implement the smallest parameterized overlay for active and standby Ubuntu hosts, separate non-secret configuration from host-mounted secrets, pin application image references to digest references, and expose only the proxy.
- [x] Verify the standalone production Compose model with a non-production fixture, the production config validator, the config package tests/typecheck/lint/build, and a non-secret scan; do not run a production deployment without actual host credentials.
- [x] Commit `feat(phase-07): add immutable production compose contract`.

### Task 3: TLS, proxy security, CSRF, SSRF, and anti-replay boundaries

**Files:** Create `infra/docker/nginx.production.conf`, `packages/server/src/security/csrf.*`, `packages/server/src/security/ssrf-policy.*`, `packages/server/src/security/replay-guard.*` and focused tests; modify API bootstrap/configuration and security documentation.

- [x] Write failing tests for TLS-only proxy behavior, HSTS/CSP/frame/content/referrer headers, Origin/CSRF-token enforcement on state-changing requests, private/link-local/loopback/metadata SSRF rejection with DNS re-check, and duplicate/expired request-id rejection without bypassing Audit/Outbox.
- [x] Implement middleware/ports using existing session and authorization boundaries; keep the controls disabled only in explicitly named test configuration, never through production fallbacks.
- [x] Verify focused security tests, API/server typecheck and lint, proxy security config test, and adversarial request fixtures. Real certificate/DNS/TLS scan evidence remains external.
- [x] Commit `feat(phase-07): enforce production request security boundaries`.

### Task 4: PostgreSQL replication, WAL archive, backup, restore, and manual promotion

**Files:** Create `infra/postgres/production.Dockerfile`, `infra/postgres/*.conf`, `scripts/production/postgres-*.mjs`, `scripts/production/postgres-*.test.mjs`, `docs/runbooks/postgres-failover.md`, `docs/runbooks/backup-restore.md`; modify production Compose and migration gate scripts.

- [ ] Write failing tests for primary/standby configuration, replication-slot/WAL retention settings, encrypted archive destination, backup integrity checks, migration lock/rollback gates, promotion preconditions, and recovery-point timestamps.
- [ ] Implement streaming replication and WAL archival contracts, `pg_basebackup` restore flow, manual promotion with fencing and DNS cutover prerequisites, and a restore verification that checks migrations, Audit, Outbox, and Phase 6 analytics data.
- [ ] Verify with a real disposable PostgreSQL pair when the Docker runtime is available; otherwise record the exact missing runtime/credential and keep the drill open.
- [ ] Commit `feat(phase-07): add postgres replication and recovery operations`.

### Task 5: Object-storage replication, cutover, and recovery

**Files:** Create `infra/garage/production-primary.toml`, `infra/garage/production-secondary.toml`, `scripts/production/object-storage-*.mjs`, focused tests, and `docs/runbooks/object-storage-failover.md`; modify production Compose and storage configuration.

- [ ] Write failing tests for versioned/encrypted buckets, replication manifests, checksum verification, denied public bucket access, cutover fencing, and restore of a representative Phase 3–6 artifact.
- [ ] Implement asynchronous S3-compatible replication with explicit source/target credentials, manifest/checksum verification, manual cutover, and rollback-safe restore; do not add a message queue or claim synchronous durability.
- [ ] Verify config lint, disposable storage checks where credentials exist, and a checksum-based restore test; record unavailable production endpoints as incomplete evidence.
- [ ] Commit `feat(phase-07): add object storage replication and recovery operations`.

### Task 6: Metrics, dashboards, alerts, and centralized logs

**Files:** Create `infra/monitoring/prometheus.production.yml`, `infra/monitoring/alertmanager.yml`, `infra/monitoring/grafana/provisioning/*`, `infra/monitoring/loki/*`, `infra/monitoring/promtail/*`, focused config tests, and `docs/runbooks/observability.md`; modify monitoring Compose services and application logging only as needed.

- [ ] Write failing tests for scrape authentication, service/worker/database/storage health, latency/error/outbox/replication/WAL/backup lag metrics, alert routing, log redaction, retention, and no employee-number/session-secret leakage.
- [ ] Implement Prometheus, Grafana, Alertmanager, and centralized log collection with production-separated credentials and dashboards for 99.5% availability, 15-minute RPO, and 2-hour RTO evidence.
- [ ] Verify config syntax, redaction fixtures, alert rule tests, and disposable service health; do not treat an unconnected notification receiver as delivered alert evidence.
- [ ] Commit `feat(phase-07): add production observability and alerting`.

### Task 7: CI/CD, immutable release, upgrade, rollback, migration, and supply-chain gates

**Files:** Create `scripts/production/release-gate.mjs`, `scripts/production/release-gate.test.mjs`, `scripts/production/rollback-gate.mjs`, `docs/runbooks/release-rollback.md`, SBOM/scan configuration; modify `.github/workflows/verify.yml`, `.gitlab-ci.yml`, Dockerfiles, and `scripts/verify.mjs`.

- [ ] Write failing tests for SHA/digest-only deploy references, lockfile/frozen install, SBOM and vulnerability thresholds, migration-before-serving, backward-compatible rollback checks, signed artifact metadata, and no mutable registry tag promotion.
- [ ] Implement CI gates that build once, record image digest/SBOM/provenance, run migration compatibility checks, require a reversible upgrade marker, and provide a dry-run rollback plan without altering the database automatically.
- [ ] Verify local release/rollback gates and CI YAML tests; external registry signing and vulnerability-service credentials remain separate evidence.
- [ ] Commit `ci(phase-07): gate immutable releases and rollback`.

### Task 8: Failure and recovery drills

**Files:** Create `scripts/production/drills/*.mjs`, `scripts/production/drills/*.test.mjs`, `docs/runbooks/failover-drill.md`, `docs/runbooks/incident-response.md`, and `docs/evidence/phase-07/` templates.

- [ ] Write failing drill assertions for DNS active-node cutover, API/worker fencing, PostgreSQL primary failure and promotion, object-storage source failure, alert creation, backup restore, and evidence timestamps.
- [ ] Implement repeatable operator commands with explicit preconditions, stop conditions, rollback/fencing steps, and evidence capture; keep simulated drills labeled simulated.
- [ ] Verify against disposable infrastructure first, then run real two-host drills only when server/network/credentials are supplied; record RPO and RTO measurements rather than targets alone.
- [ ] Commit `test(phase-07): add production failure and recovery drills`.

### Task 9: Necessary regression and integration validation

**Files:** Modify Phase 7 ledger/visualization and add only focused regression fixtures/tests under `apps/api/test`, `apps/worker/test`, `apps/web/src`, `packages/server/src`, and `packages/database/src` when a Phase 7 boundary requires them.

- [ ] Run the necessary API, Worker, Web, permission, Audit, Outbox, migration, backup/restore, Compose, security, and deployment tests; reuse Phase 6 accepted full-gate evidence without relabeling it as Phase 7 evidence.
- [ ] Verify that no Phase 3–6 business semantics, tenant model, or prohibited infrastructure changed.
- [ ] Record exact commands, counts, failures, environment, and unresolved external dependencies.

### Task 10: Phase 7 final gates, two-axis review, commit, push, and Draft PR status

**Files:** Phase 7 plan/ledger/ADR, `processing_visualization.html`, review evidence, and no unrelated files.

- [ ] Run exact final gates plus production Compose/config/security/supply-chain/backup/recovery evidence; reject cached or simulated output as production proof.
- [ ] Review the complete Phase 7 diff against the roadmap, ADR 0008, security/reliability axes, and all user constraints; resolve every actionable finding or record a genuine external blocker.
- [ ] Verify branch ancestry/status, commit the documentation closeout, push without force, and attempt Draft PR creation only through available integration; record a real PR URL or the exact HTTP/network blocker.
- [ ] Declare Phase 7 complete only if all required production, recovery, SLO/RPO/RTO, regression, review, push, and Draft PR/blocker conditions are evidenced; otherwise report Phase 7 as incomplete with a bounded blocker list.

## Completion gate

Phase 7 is complete only when the two-host production Compose is deployable, the security and supply-chain gates pass, PostgreSQL and object-storage recovery/failover drills pass, observability and runbooks are verifiable, 99.5%/RPO 15 minutes/RTO 2 hours have measured evidence, upgrade/rollback/migration gates pass, real API/Worker/Web regressions pass, both review axes have no actionable findings, the branch is pushed, and a Draft PR exists or the external blocker is explicitly recorded. Phase 8 pilot, UAT, formal go-live, and enterprise sign-off remain excluded.
