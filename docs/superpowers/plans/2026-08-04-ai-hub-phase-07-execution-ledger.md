# Phase 7 Execution Ledger

Date: 2026-08-04

## Baseline decision

Phase 6 is accepted input from
`feature/phase-06-analytics-dashboard-export-assistant` at commit
`e8255b31949fead551fae4abd3ef94d1979d38c2`. The new branch is
`feature/phase-07-production-security-deployment-operations`.

The working tree initially contained only the existing untracked `.codex/`
directory. It is user-owned workspace state and is excluded from staging.
The local Phase 6 remote-tracking branch resolved to the same commit. A fresh
`git ls-remote` was attempted but the GitHub endpoint returned an empty reply;
no unverified remote result is treated as evidence.

Phase 3–6 accepted evidence is consumed from their plans, ledgers, ADRs,
roadmap, and Phase 6 remote-tracking evidence. Their full gates are not
repeated. Only Phase 7 boundary regressions are required.

## Scope and non-goals

Phase 7 covers two Ubuntu Server production Compose hosts, internal-DNS
health-based switching, PostgreSQL streaming replication/WAL archive/manual
promotion, object-storage replication and recovery, Prometheus/Grafana/
Alertmanager/centralized logs, TLS/CSP/CSRF/SSRF/anti-replay controls,
immutable-image CI, upgrade/rollback/migration gates, backups, drills, and
operator runbooks.

The single-enterprise model, existing business semantics, ActorContext/RBAC,
Audit, Outbox, migration, and rollback boundaries remain unchanged. Redis,
Elasticsearch, message queues, Kubernetes, microservices, a new tenant model,
and unrestricted public Open APIs remain prohibited. Phase 8 pilot, UAT,
formal go-live, and enterprise sign-off are explicitly deferred.

## Target evidence

| Target | Required evidence | Status |
|---|---|---|
| Two-host production Compose | Validated Compose model, immutable image/secret contract, disposable fixture; real host deployment still external | contract passed |
| Active-node switching | Internal DNS health check, fencing, cutover and rollback measurements | pending |
| PostgreSQL recovery | Streaming/WAL settings and recovery evidence contract passed; real pair/restore pending Docker/host access | at risk |
| Object-storage recovery | Async replication policy/manifest contract passed; real sites/cutover/restore pending | at risk |
| Observability | Scrape/config tests, dashboards, alert route and redacted centralized logs | pending |
| Security | TLS/CSP/CSRF/SSRF/anti-replay adversarial tests; real certificate/DNS scan still external | policy passed |
| Release safety | Immutable image, SBOM/provenance, migration, upgrade and rollback gates | pending |
| Reliability targets | Measured 99.5% availability, RPO <= 15 minutes, RTO <= 2 hours | pending |
| Delivery | Branch push and Draft PR URL or exact external blocker | pending |

## Ordered execution and evidence

1. Baseline, plan, ledger, ADR 0008, visualization.
2. Production Compose, configuration layers, secrets, immutable images.
3. TLS, proxy, headers, CSRF, SSRF, anti-replay.
4. PostgreSQL replication, WAL, backups, restore, manual promotion.
5. Object-storage replication, cutover, restore.
6. Metrics, dashboards, Alertmanager, centralized logs.
7. CI/CD release, rollback, migration and supply-chain gates.
8. Failure and recovery drills.
9. Necessary API/Worker/Web/security/backup/deployment regression.
10. Final gates, two-axis review, commit, push, Draft PR or blocker.

No step is passed from an unexecuted command, cached result, local-only
simulation, incomplete credential, incomplete network, or undelivered drill.

### Step 1: Baseline and planning

- Branch base: `e8255b31949fead551fae4abd3ef94d1979d38c2`.
- Branch: `feature/phase-07-production-security-deployment-operations`.
- Existing `.codex/` preserved and excluded.
- Phase 6 evidence reused; Phase 3–6 full gates not repeated.
- Plan, ledger, ADR 0008, and visualization established in commit `b64c41e`.
- Verification: `git diff --check` and `corepack pnpm format:check` passed.
- Step status: passed.

### Step 2: Production Compose and immutable configuration

- RED: `node --test scripts/production/validate-config.test.mjs` initially failed with `ERR_MODULE_NOT_FOUND` because the validator did not exist; the config package secret-file test failed because `DATABASE_URL_FILE` and `COOKIE_SECRET_FILE` were ignored.
- GREEN: the validator now rejects missing role/secrets, mutable images, development fallbacks, and database/storage host ports. It passed 5/5 tests. Config package passed 3/3 tests, typecheck, lint, and build after reading mounted secret files. `docker compose --env-file scripts/production/fixtures/compose.env -f compose.production.yaml config --quiet` passed with Docker warnings about inaccessible local Docker credentials. `corepack pnpm format:check` and `git diff --check` passed. Non-secret scan found no fallback secret values in production artifacts; the `cookie_secret` match is only a Compose secret name.
- Implementation: `compose.production.yaml` is a standalone active/standby contract with digest-pinned image variables, host-mounted secrets, no database/storage host ports, read-only/no-new-privileges application containers, and only proxy ports. The example env files and runbook explicitly require replacement and do not claim deployment.
- Production host/secret/image-signature/DNS evidence: pending; no local fixture is accepted as production evidence.
- Commit: `9fc3a44 feat(phase-07): add immutable production compose contract`.

### Step 3: Security boundaries

- RED: focused CSRF/SSRF/replay and proxy tests were added before implementation; the modules/config file were absent, producing the expected missing-module/config failure. A later strict typecheck also caught an unavailable Node `LookupAddress` type and was fixed before green.
- GREEN: server passed 27 files/105 tests, server/database/API typechecks and server/API lint passed, and the production proxy test passed 1/1. The security boundary includes TLS proxy headers/redirect, CSRF double-submit checks, DNS-resolved private-address rejection, and PostgreSQL-backed hashed nonce uniqueness through migration `0012`.
- Verification: `corepack pnpm --filter @ai-hub/server test`; `corepack pnpm --filter @ai-hub/server typecheck`; `corepack pnpm --filter @ai-hub/server lint`; matching database/API typecheck and API lint; `node ../../node_modules/vitest/vitest.mjs run test/proxy-production-config.test.ts` from `apps/api`.
- Real certificate/DNS/network/TLS scan and two-host replay evidence: pending until supplied.
- Commit: `1f59742 feat(phase-07): enforce production request security boundaries`.

### Step 4: PostgreSQL recovery

- RED: `node --test scripts/production/postgres-ops.test.mjs` initially failed with `ERR_MODULE_NOT_FOUND` because the operations validator did not exist.
- GREEN: PostgreSQL operations tests passed 4/4; `@ai-hub/database` typecheck passed; the production Compose model still validates with primary settings and explicit host-mounted config/WAL paths. The runbook covers `pg_basebackup`, replication slot, WAL archive, fencing, manual promotion, restore verification for migrations/Audit/Outbox/analytics, DNS cutover, and RPO/RTO measurement.
- Disposable PostgreSQL/API evidence attempt: existing Docker-backed API tests returned `Could not find a working container runtime strategy`; no two-node pair, backup medium, replication credentials, or real restore was available. This is an external blocker and the drill remains open.
- Commit: `345133c feat(phase-07): add postgres replication and recovery operations`.

### Step 5: Object-storage recovery

- RED: `node --test scripts/production/object-storage-ops.test.mjs` initially failed with `ERR_MODULE_NOT_FOUND` because the storage operations validator did not exist.
- GREEN: object-storage ops tests passed 4/4; the production Compose model accepts explicit primary/secondary Garage config paths; primary/secondary configs, versioned/private/encrypted bucket policy, deterministic SHA-256 manifests, fencing, conflict checks, and manual cutover/restore Runbook were added. No queue or synchronous durability claim was introduced.
- Production storage endpoints, credentials, independent medium, and real replication/cutover/restore: pending; no local manifest is treated as production evidence.
- Commit: `2fbb5aa feat(phase-07): add object storage replication and recovery operations`.

### Step 6: Observability and logs

- RED command and failure: pending.
- GREEN implementation and config/redaction verification: pending.
- Connected alert receiver and central log destination: pending.
- Commit: pending.

### Step 7: CI/CD and supply chain

- RED command and failure: pending.
- GREEN implementation and local/CI gate verification: pending.
- Registry signing, provenance, and vulnerability-service credentials: pending.
- Commit: pending.

### Step 8: Drills

- RED command and failure: pending.
- Disposable drill evidence: pending.
- Real two-host measured RPO/RTO evidence: pending and must not be simulated.
- Commit: pending.

### Step 9: Necessary regressions

- API/Worker/Web/permission/Audit/Outbox/backup/deployment command list: pending.
- Exact test counts and environment: pending.
- Phase 3–6 full-gate reuse remains explicit.

### Step 10: Final gates and delivery

- Exact Phase 7 gates: pending.
- Two-axis review: pending.
- Push: pending.
- Draft PR: pending; no PR will be described without a returned URL/number.

## External blockers and integrity rules

- GitHub remote read was blocked during baseline by an empty reply from the
  endpoint; the local remote-tracking commit is the only current remote
  evidence.
- Real Ubuntu hosts, internal DNS, TLS certificates, outbound allowlists,
  backup media, storage replication endpoints, alert receivers, registry
  signing, and production credentials are not present in the repository.
- These prerequisites may be documented and validated structurally, but they
  cannot be marked deployed, recovered, or production-ready until executed
  with fresh evidence.
- Draft PR existence is unknown until the configured GitHub integration returns
  a URL or an exact external error.
