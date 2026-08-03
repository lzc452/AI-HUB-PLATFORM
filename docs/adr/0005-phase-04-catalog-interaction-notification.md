# ADR 0005: Phase 4 catalog, interaction, and notification boundaries

- Status: Accepted for Phase 4
- Date: 2026-08-03
- Decision owners: Product, platform engineering, security review

## Context

Phase 3 provides the published application lifecycle, four delivery channels,
identity context, authorization, audit, and transactional outbox. Phase 4
needs to expose a searchable application market and creator-facing aggregates
without weakening those lifecycle gates or exposing employee-level access data.

## Decisions

1. The catalog is a PostgreSQL read model. It stores explicit category, tag,
   audience, normalized name/summary, pinyin, initials, health, and trust-label
   fields. Search uses indexed `ILIKE` predicates; Elasticsearch, Redis, and a
   second search service are out of scope for V1.
2. Audience predicates are applied in the catalog query before sorting and
   pagination. The same visible-record check protects detail and delivery
   action recording, so an unauthorized application is not revealed by a
   count, detail response, or action endpoint.
3. Catalog detail exposes only the published current version and delivery
   channels. Web redirect, package download, and QR display are recorded as
   append-only action events. Health and deprecated/replacement metadata remain
   read-only catalog labels; they do not bypass Phase 3 publication guards.
4. Likes and ratings are unique per employee/application. Reviews and replies
   are stateful records; replies are limited to one nested level and official
   replies require the application owner or maintainer. Reports hide or restore
   content through state changes, never physical deletion.
5. Anonymous display is presentation-only. The real author remains in the
   interaction row; super-admin identity lookup requires an explicit
   authorization decision and creates an audit event.
6. Notifications have a durable in-app record and idempotency key. DingTalk is
   an adapter port: delivery failure records retry state and does not roll back
   the successful business transaction.
7. Creator center returns version differences, validation status, and aggregate
   action/like/rating metrics only. It never returns visitor lists or individual
   access identities.

## Consequences

These decisions keep permission enforcement close to the data read path and
make the Phase 4 tests deterministic with PostgreSQL and in-memory adapters.
The catalog mapping currently performs small related-record reads per result;
that is acceptable for the Phase 4 V1 scale and is a later optimization target.
Real DingTalk credentials, external delivery, personalized recommendations,
and Phase 5 innovation-square workflows remain deployment or later-phase work.
