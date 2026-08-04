# PostgreSQL replication, backup, restore, and promotion runbook

This is an operator procedure and evidence contract. It does not mean that a
production pair exists in the repository.

## Provisioning

1. Select the approved private replication CIDR and replace the example
   `10.20.0.0/24` in `infra/postgres/pg_hba.production.conf`; never use
   `0.0.0.0/0` for replication.
2. On the primary, create a dedicated `replicator` role with `REPLICATION` and
   `LOGIN`, a password stored outside the repository, and a physical replication
   slot. Mount `primary.conf`, `pg_hba.production.conf`, and an independent WAL
   archive directory.
3. Take a fresh `pg_basebackup` from the primary into the standby data volume.
   Write `primary_conninfo` and the replication password through a host-only
   `pgpass`/`postgresql.auto.conf` file. Mount `standby.conf` and keep the
   standby fenced from the application DNS name.
4. Confirm `pg_stat_replication`, replay timestamp, archive freshness, and
   replication lag before serving any traffic.

## Backup and restore

Use a scheduled encrypted physical base backup plus WAL archive on independent
storage. For every backup, record `backupId`, start/end times, SHA-256, archive
range, restore timestamp, and verified `schema_migrations`, `audit_events`,
`outbox_events`, and `analytics_daily_aggregates`. A backup without restore
verification is not recovery evidence.

## Manual promotion

1. Confirm the primary is fenced at the process, host, and internal DNS layers.
2. Confirm the latest backup and WAL archive are no older than 15 minutes and
   replication lag is measured.
3. Stop the standby replay, promote it manually, verify migrations/readiness,
   then start API/Worker only on the promoted host.
4. Switch internal DNS after health checks pass, record DNS TTL and first
   successful request, and preserve the old primary as fenced evidence.
5. Rebuild the former primary from a fresh base backup before rejoining it.

The repository currently lacks two Ubuntu hosts, an independent backup medium,
replication credentials, and a DNS zone. Until a real promotion and restore
are measured, RPO 15 minutes and RTO 2 hours remain targets, not passed gates.
