# Phase 7 Incident Response Runbook

## First ten minutes

1. Declare the incident and assign incident commander, operations lead,
   database/storage lead, and communications owner.
2. Record UTC timestamps, affected host, public origin, current DNS answer,
   database role/LSN, object-storage site, and the latest alert payload.
3. Preserve logs and audit records. Do not disable authorization, CSRF,
   anti-replay, audit, Outbox, or migration safeguards to restore traffic.
4. Fence the suspected active writer before any promotion or storage cutover.

## Decision rules

- Use the internal DNS health-based switch only after the active endpoint is
  fenced and the standby health checks are green.
- Promote PostgreSQL manually only after fresh-backup, WAL/archive, replay,
  and fencing checks are recorded.
- Switch object storage only after the replication manifest and checksum are
  verified; record the replication watermark and any conflicts.
- If evidence cannot demonstrate RPO <= 15 minutes or RTO <= 2 hours, keep the
  service in the declared degraded state and escalate rather than claiming the
  target was met.

## Recovery and closure

1. Run authenticated API, worker health, web origin, permission, audit, and
   representative read/write checks.
2. Verify no duplicate writes, missing audit entries, stuck Outbox rows, or
   schema drift. Preserve the database and object-storage restore checksums.
3. Communicate impact and recovery timestamps. Open corrective actions for
   every failed or unmeasured control.
4. Close only when the incident commander approves the evidence package and
   the post-incident review records root cause, containment, recovery, and
   follow-up owners.

This runbook is operational guidance, not evidence that a production incident
or recovery drill has occurred.
