# Phase 7 Evidence Package

Create one immutable evidence directory per approved drill or deployment
window. Do not store credentials, private keys, bearer tokens, or customer
data in the repository.

Required files:

- `metadata.json`: drill ID, scenario, operators, approver, UTC timestamps,
  commit SHA, host identifiers, and declared RPO/RTO measurements.
- `events.json`: ordered failure, fencing, cutover/promotion, health, and
  restore events.
- `checksums.txt`: backup and object manifest checksums.
- `alerts/`: Alertmanager notification and recovery evidence.
- `logs/`: redacted command output and centralized-log query evidence.
- `signoff.md`: deviations, unresolved findings, and operator/approver signoff.

Run `node scripts/production/drills/drill-ops.mjs --evidence metadata.json`
through the approved evidence collection wrapper after capturing the package.
A local validator pass is
necessary but does not replace real host, network, credential, or restore
evidence.
