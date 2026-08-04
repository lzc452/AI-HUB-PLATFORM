# Phase 7 Failure and Recovery Drill Runbook

This runbook defines the evidence required for a production-like drill. The
repository validator is a contract test only; a passing local or disposable
environment is not production evidence.

## Preconditions

1. Record the drill ID, operator, approver, UTC start time, active host,
   standby host, DNS health-check result, PostgreSQL LSN/replication lag, WAL
   archive location, object-storage replication watermark, and alert channel.
2. Confirm a fresh backup and a known-good restore target. Confirm fencing is
   available before any promotion or write traffic is enabled.
3. Confirm the rollback owner and abort authority. Do not run a drill against
   an unapproved production customer window.

## Ordered scenarios

Run one scenario per evidence package. Stop if the preceding restore or
fencing check fails.

| Scenario | Injected failure | Required control evidence | Recovery proof |
| --- | --- | --- | --- |
| DNS cutover | Mark active health check failed | `dns-cutover`, old endpoint fenced | API health, write/read check, DNS TTL observation |
| PostgreSQL failure | Isolate primary database | `standby-promoted`, old primary fenced | migration/schema check, write/read check, backup restore checksum |
| Object-storage failure | Isolate primary bucket/site | `object-storage-cutover`, old site fenced | manifest checksum, upload/download check, restore checksum |

For every scenario, capture monotonic UTC timestamps for failure injection,
fencing, cutover/promotion, health recovery, and restore verification. The
evidence must prove `rpoSeconds <= 900` and `rtoSeconds <= 7200`.

## Abort and rollback

- Abort if fencing is not confirmed, replication lag exceeds the declared RPO,
  checksum verification fails, or writes could reach both sides.
- Re-fence the promoted side before reversing traffic. Restore the last known
  good backup if data checks fail; never use an automatic destructive database
  rollback.
- Attach command output, alert notifications, timestamps, and operator signoff
  to the evidence package. Record all deviations as unresolved findings.

## Evidence status

The repository currently contains the validator and runbook contract only.
Real Ubuntu hosts, DNS control, backup media, storage endpoints, credentials,
alert receivers, and an approved drill window are external prerequisites and
must be completed before this runbook can be marked passed.
