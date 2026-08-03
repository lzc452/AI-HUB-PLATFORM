# ADR-0004: Application Version, Release, and Review Boundary

## Status

Accepted for Phase 3.

## Context

The platform needs a controlled internal application delivery path. An application has an owner, immutable versions, four independent delivery channels, an artifact verification pipeline, manual review, publication, withdrawal, archive, and rollback. Phase 2 already provides the actor context and authorization boundary; Phase 3 consumes that boundary without introducing tenancy or a second permission model.

## Decision

- Store applications, versions, delivery configurations, reviews, and application audit events in PostgreSQL.
- Store `owner_employee_id`, `maintainer_employee_id`, and `department_id` on every application. If the caller omits maintainer or department, the service derives them from the Phase 2 actor context.
- Make version identity and artifact metadata append-only. A changed artifact creates a new version; a database trigger rejects mutation of the artifact key, digest, or signature.
- Require accepted artifact-pipeline verification, a passed malware scan, an exact SHA-256 digest, and a valid signature before a version can enter review or publication.
- Enforce `draft -> in_review -> approved -> published -> withdrawn -> archived`. A published application may submit a newly created version for review while the current version remains available.
- Permit rollback only between versions of the same published application. Rollback keeps both versions readable, points the application at the selected version, and writes audit and outbox records.
- Prevent self-review and physical deletion. Withdrawal and archive are explicit state transitions.
- Keep web, desktop, mobile, and mini-program delivery configurations separate and independently addressable.
- Publishing is a Phase 3 gate only when all four delivery records are enabled; no channel is silently treated as optional.
- On submission, create one review-pool item with a 24-hour SLA. Reviewers may claim or release it; only the claimant may decide. SLA status is calculated as `on_time` or `overdue` and submission emits notification outbox events. External delivery and a dedicated operations UI are deferred.
- Write state-change audit and outbox records in the same repository transaction.
- Use storage, scanner, and signature ports. Deterministic memory adapters are for tests; Garage-compatible object storage, ClamAV, and signing credentials remain deployment adapters.

## Consequences

The API exposes a protected lifecycle while the web administration shell remains read-only. Review, publication, and rollback are auditable and recoverable. The real API e2e suite exercises approve, reject, claim/release, publish, rollback, withdraw, archive, and four-channel delivery against PostgreSQL. External scanner/storage credentials, production delivery endpoints, and external notification transport remain deployment risks and are not hidden behind local test adapters.
