# ADR 0007: Phase 6 analytics, dashboards, export, and external assistant boundaries

- Status: Accepted for Phase 6 execution
- Date: 2026-08-03
- Decision owners: Product, platform engineering, security review

## Context

Phase 5 is accepted at commit `4a6e9e4c48ecfaaf8895db56741e7e0f7675b3d5`.
It provides the single-enterprise identity model, `ActorContext`, RBAC,
audience authorization, PostgreSQL Audit/Outbox, governed application
lifecycle, and AI demand lifecycle. Phase 6 needs trustworthy analytics and
operator assistance without changing those business semantics or exposing
employee identity and internal resources to an external system.

## Decisions

1. Record normalized raw behavior events as the analytics source of truth.
   Events retain only the approved event payload, actor reference, aggregate
   reference, audience context, and occurred-at time; no `tenant_id` is added.
2. Keep raw events for 180 days. Daily aggregates are derived state and can be
   rebuilt from the retained raw events for any permitted time range. A
   retention job writes its deletion/rebuild audit record and never deletes
   Phase 3–5 business records.
3. Fixed dashboards read a versioned metric dictionary and daily aggregates.
   Each metric declares source events, formula, time range, audience, required
   permission, and re-computation procedure. Dashboard queries apply
   `ActorContext`, RBAC, and audience predicates before aggregation output.
4. Background export is an authenticated, permission-checked application
   capability. Every request, row policy decision, completion/failure, and
   download is audited. Export payloads use the same anonymous projection as
   ordinary reads and never include an employee access list to an application
   owner.
5. The Dify adapter is an outbound boundary, not a public Open API. It sends
   only the minimum authorized, redacted context after an explicit assistant
   authorization review. It never sends employee IDs, employee numbers,
   internal URLs, files, QR codes, or anonymous identities. Failures return a
   safe local fallback and remain auditable.
6. DingTalk work notifications are represented by a fixed scenario matrix and
   delivered through the existing transactional Outbox. External credentials
   and production deployment remain Phase 7 concerns.
7. No Redis, Elasticsearch, message queue, Kubernetes, microservice,
   tenant model, or Phase 7 production/security/operations implementation is
   introduced.

## Consequences

The analytics module remains a bounded context in the modular monolith. Raw
events make dashboard numbers reproducible, while precomputed daily rows keep
fixed dashboard reads bounded. Permission and anonymity decisions are made at
the application boundary before data leaves the platform; the Dify provider
cannot become an alternate identity or data-access path. Rebuilds, exports,
assistant requests, and notifications have explicit audit evidence and can be
tested with fake adapters plus real PostgreSQL/API e2e.
