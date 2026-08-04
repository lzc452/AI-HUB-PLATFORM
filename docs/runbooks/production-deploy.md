# Production Compose deployment runbook

This runbook is a Phase 7 operating artifact, not evidence that either Ubuntu
host is deployed. It must be executed separately on the active and standby
hosts after host, DNS, TLS, registry, secret, and backup prerequisites are
approved.

1. Copy the matching `infra/production/*.env.example` to a host-only env file.
2. Create all files listed by `infra/production/secrets/README.md` with mode
   `0600`; verify no development fallback remains.
3. Resolve every image to a CI-produced digest and record the digest/SBOM in the
   release evidence directory.
4. Run:

   ```powershell
   node scripts/production/validate-config.mjs
   docker compose --env-file /etc/ai-hub/production.env -f compose.production.yaml config --quiet
   docker compose --env-file /etc/ai-hub/production.env -f compose.production.yaml pull
   docker compose --env-file /etc/ai-hub/production.env -f compose.production.yaml up --detach
   ```

5. Confirm proxy health, API readiness, database migration gate, worker health,
   and DNS health-check state. Do not switch internal DNS until the database,
   object-storage, backup, and observability checks are green.

The current repository does not contain the actual hosts, DNS zone, TLS
certificates, production credentials, or registry signatures. Those missing
inputs must remain an explicit deployment blocker rather than being inferred
from a local Compose config check.
