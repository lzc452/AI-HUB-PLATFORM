# Release Upgrade and Rollback Runbook

Application rollback is immutable-image replacement plus a forward-compatible
database fix. Automatic destructive down-migrations are forbidden.

## Before upgrade

1. Record the release commit SHA, every image digest, SBOM/provenance report,
   migration plan, rollback marker, fresh backup ID, and restore verification
   path.
2. Confirm the target migration is forward compatible and that the previous
   image digests are available in the registry.
3. Fence the active writer before database or object-storage recovery actions.
4. Run `rollback-gate.mjs` in dry-run mode and obtain the operations approval
   marker. A dry-run is evidence of preconditions, not a production recovery.

## Upgrade and rollback

1. Build once with commit, SBOM, and provenance metadata; promote only the
   resulting immutable digests.
2. Apply the forward-compatible migration before serving the new application.
3. If the application fails health, stop traffic, preserve logs/audit/Outbox
   evidence, and switch back to the previous image digests only after fencing.
4. If the schema requires correction, deploy a reviewed forward-fix. Do not
   run an automatic `DROP`, `TRUNCATE`, `DELETE`, or down-migration rollback.
5. Verify authenticated API, worker, web, permission, audit, Outbox, database
   restore, and object-storage checksum checks before reopening traffic.

## Evidence boundary

The CI source contract and local rollback validator are necessary controls.
They do not prove a registry signature, vulnerability scan, migration against
production-like PostgreSQL, or a real upgrade/rollback window.
