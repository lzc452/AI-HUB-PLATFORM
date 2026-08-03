# ADR 0006: Phase 5 AI demand and innovation-square boundaries

- Status: Accepted for Phase 5 execution
- Date: 2026-08-03
- Decision owners: Product, platform engineering, security review

## Context

Phase 4 provides the single-enterprise identity, ActorContext, RBAC and
audience authorization, PostgreSQL audit/outbox boundaries, and the published
application lifecycle. Phase 5 needs an auditable demand workflow that can be
shown to authorized employees, coordinated by owners and operators, prioritized
with explainable inputs, and connected to formal applications without creating
a second publication path.

## Decisions

1. Store demands and their lifecycle as normalized PostgreSQL records. Draft,
   review, publication, progress, pilot, close, merge, comment, report, and
   application-link rows are stateful or append-only; none are physically
   deleted.
2. Reuse the existing audience model (`all`, `department`, `employee`) and
   apply the employee's department/employee predicates in the repository before
   sorting, pagination, or detail output. Do not add `tenant_id`.
3. Anonymous display is a projection concern. The requester/author identity
   stays in the database; ordinary readers receive an anonymous projection and
   an authorized administrator identity lookup creates a dedicated audit event.
4. Claim, merge, status transitions, and primary-solution selection use an
   optimistic version plus database uniqueness/conditional-update protection.
   A lost update returns an explicit conflict and never silently overwrites a
   newer decision.
5. Priority is a deterministic, persisted score derived from bounded business
   value, implementation cost, risk, and administrator priority inputs. The
   stored explanation is returned with authorized management views and recorded
   in the demand audit trail.
6. The demand-to-application bridge may create or associate a draft application
   and may prepare versions/delivery data through existing services, but it may
   not set `applications.status = 'published'`. Artifact verification, review,
   publication, withdrawal, and archive remain Phase 3 application lifecycle
   responsibilities.
7. Demand mutations write audit and outbox records in the same transaction as
   the business state change. No Redis, Elasticsearch, external message queue,
   microservice, public Open API, or Phase 6 analytics/export surface is added.

## Consequences

The demand module remains a bounded context within the modular monolith and
can reuse authorization and application services without duplicating lifecycle
rules. PostgreSQL conditional updates and partial unique indexes make the
high-value concurrent decisions testable with real database e2e tests. The V1
priority formula is intentionally explainable and fixed; personalized ranking,
analytics dashboards, exports, and external assistant integration remain later
phase work.
