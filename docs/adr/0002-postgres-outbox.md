# ADR 0002: PostgreSQL Transactional Outbox

- Status: Accepted
- Date: 2026-07-31

## Context

Background work must be recorded atomically with the database changes that
request it. V1 also needs repeatable local and CI environments without another
stateful infrastructure dependency.

## Decision

Store background events in the PostgreSQL `outbox_events` table in the same
transaction as the originating change. Workers claim available rows with
database locking, execute registered handlers, and record completion or a safe
failure code. Idempotency keys protect producers from duplicate appends.

## Consequences

- PostgreSQL remains the single transactional source of truth.
- Worker delivery is at least once, so handlers must remain idempotent.
- Outbox backlog and handler outcomes are observable through Prometheus metrics.
- Retention and archival policies will be added when production volume is known.

## Rejected Alternatives

- Redis-backed queues: rejected because Redis is not otherwise required by V1
  and would introduce another persistence and recovery model.
- External message brokers: rejected because V1 throughput and integration
  requirements do not justify their operational cost.
