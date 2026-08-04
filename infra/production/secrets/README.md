# Production secrets

Place one secret per file under a host-only directory such as
`/etc/ai-hub/secrets` with owner `root`, group readable only by the deployment
operator, and mode `0600`. The files referenced by the production env examples
are required: `database_url`, `cookie_secret`, `db_password`,
`garage_admin_token`, `garage_access_key`, `garage_secret_key`,
`garage_metrics_token`, and `garage_rpc_secret`.

Never commit these files, put secret values in Compose YAML, or reuse the
development defaults from `compose.yaml`. A host is not production-ready until
the secret inventory, rotation owner, backup treatment, and restore test are
recorded in the Phase 7 ledger.
