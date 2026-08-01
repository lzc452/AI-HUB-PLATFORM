# AI Hub Platform

AI Hub Platform is a pnpm monorepo for the React Web application, NestJS API,
and NestJS outbox worker. The supported runtime is Node.js 18.18 or newer;
Node.js 24 is the preferred CI and container baseline.

## Development

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
```

The development application is available at `http://127.0.0.1:8080`.

## Project Documents

- [Approved design specification](docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md)
- [V1 program roadmap](docs/superpowers/plans/2026-07-31-ai-hub-v1-program-roadmap.md)
- [Phase 1 foundation plan](docs/superpowers/plans/2026-07-31-ai-hub-phase-01-foundation.md)
- [Windows Docker Compose guide](docs/development/windows-docker-compose.md)
- [ADR 0001: React SPA and NestJS modular monolith](docs/adr/0001-modular-monolith.md)
- [ADR 0002: PostgreSQL transactional outbox](docs/adr/0002-postgres-outbox.md)
- [ADR 0003: Garage object storage](docs/adr/0003-garage-object-storage.md)
