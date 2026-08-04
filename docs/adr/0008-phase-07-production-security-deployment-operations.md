# ADR 0008: Phase 7 production security, deployment, and operations boundaries

- Status: Accepted for Phase 7 execution
- Date: 2026-08-04
- Decision owners: Product, platform engineering, security review, operations

## Context

Phase 6 is accepted at `e8255b31949fead551fae4abd3ef94d1979d38c2`. It provides
the single-enterprise identity model, ActorContext/RBAC, PostgreSQL Audit and
Outbox, analytics retention and rebuild boundaries, guarded external-assistant
boundary, and the existing Docker Compose runtime. Phase 7 must make those
boundaries operable on two Ubuntu Servers without changing business semantics
or treating a local template as a production deployment.

The required reliability objectives are 99.5% availability, RPO 15 minutes,
and RTO 2 hours. External production hosts, DNS, certificates, backup media,
storage endpoints, alert receivers, registry credentials, and GitHub write
permissions are environmental prerequisites and must be evidenced separately.

## Decisions

1. Use one parameterized production Compose overlay on each of two Ubuntu
   hosts. The overlay accepts an explicit `NODE_ROLE` and immutable image
   references, publishes only the TLS reverse proxy, and reads secrets from
   host-mounted secret files or an approved secret provider. Development
   defaults are rejected in production validation.
2. Use internal DNS health-based switching rather than adding Keepalived to the
   application repository. DNS points to the fenced active proxy; promotion,
   health verification, TTL measurement, and rollback are operator actions
   recorded by a runbook. The DNS choice does not remove the need for fencing.
3. Use PostgreSQL primary/standby streaming replication with a replication
   slot, WAL archiving to independent storage, periodic base backups, and
   manual promotion. Promotion is never implicit in application code. Restore
   must verify migrations, Audit, Outbox, and Phase 6 analytics data.
4. Use asynchronous S3-compatible object replication with versioning,
   encryption, manifest/checksum verification, and manual cutover. It is not
   described as synchronous durability and does not introduce a queue.
5. Use Prometheus, Grafana, Alertmanager, and centralized redacted logs to
   expose service, worker, database, storage, security, backup, replication,
   and SLO evidence. An unconfigured receiver is not evidence of delivered
   alerting.
6. Terminate TLS at the production proxy and enforce secure headers, CSP,
   CSRF, SSRF, and anti-replay at the existing authenticated API boundary.
   Controls must preserve existing authorization, Audit, and Outbox behavior.
7. Build once per commit, record image digests/SBOM/provenance, gate migration
   compatibility, and retain a tested rollback path. Mutable tags and automatic
   destructive rollback are prohibited.
8. Keep Phase 8 pilot, UAT, formal go-live, and enterprise sign-off out of
   scope. Local/disposable drills are labeled as such until real two-host
   evidence is captured.

## Consequences

The production operating model remains a modular monolith with explicit
failure boundaries instead of adding distributed application infrastructure.
Manual promotion and DNS switching add operator work but make fencing,
rollback, and evidence visible. Async object replication means the measured
RPO must be proven by drill; the target is not inferred from configuration.
Security and supply-chain checks become repeatable CI/configuration contracts,
while real credentials, hosts, and network behavior remain external evidence.
