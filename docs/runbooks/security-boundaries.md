# Production security boundary runbook

## TLS and proxy

`infra/docker/nginx.production.conf` redirects HTTP to HTTPS, terminates TLS
1.2/1.3, emits HSTS/CSP/frame/content/referrer/permissions headers, and rate
limits the internal API path. The certificate and key are host-mounted secrets;
the repository contains no production certificate. Before DNS cutover, run the
proxy syntax check with the approved image and record certificate expiry,
hostname coverage, and an external TLS scan.

## CSRF

Production state-changing requests require the configured same-origin
`Origin`, a `csrf_token` cookie, and a matching `x-csrf-token` header. Safe
methods are not subject to the double-submit check. The API middleware is
enabled only when `NODE_ENV=production`; test fixtures do not prove a deployed
host is protected.

## SSRF

Outbound HTTP adapters must call `assertPublicHttpTarget` before connecting.
The policy permits only HTTP(S), rejects credentials, loopback/link-local/
private/ULA/metadata destinations, and rejects any DNS answer that resolves to
a private address. Callers must resolve again immediately before connecting if
the provider performs a separate connection step.

## Anti-replay

State-changing requests require `x-request-nonce` and an ISO timestamp within
five minutes of server time. The nonce is SHA-256 hashed and inserted into the
PostgreSQL `request_replay_nonces` table with a unique key, so both production
hosts share the replay boundary without Redis. Duplicates return a conflict;
expired rows are cleaned during consumption.

The security tests prove policy behavior and the migration/type boundary. A
real production claim additionally requires a two-host API request test through
the active DNS name and evidence that the standby shares the same PostgreSQL
replay table.
