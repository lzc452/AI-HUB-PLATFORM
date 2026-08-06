# AI Hub Platform

AI Hub Platform is a pnpm monorepo for the React Web application, NestJS API,
and NestJS outbox worker. The supported runtime is Node.js 18.18 or newer;
Node.js 24.15.0 is the repository, CI, and container baseline.

## Development

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
docker pull node:24.15.0-bookworm-slim
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
```

The development application is available at `http://127.0.0.1:8080`.
The development Compose API runs migrations and then seeds five local demo
accounts. To seed an already migrated database manually, run:

```powershell
corepack pnpm migrate
corepack pnpm seed:demo-accounts
```

These credentials are for local development and tests only; never use them in
production:

| Employee ID        | Role                 | Password                |
| ------------------ | -------------------- | ----------------------- |
| `DEMO-EMPLOYEE`    | `employee`           | `Demo-Employee-2026!`   |
| `DEMO-APP-ADMIN`   | `application_admin`  | `Demo-AppAdmin-2026!`   |
| `DEMO-INNOVATION`  | `demand_operator`    | `Demo-Innovation-2026!` |
| `DEMO-ORG-ADMIN`   | `organization_admin` | `Demo-OrgAdmin-2026!`   |
| `DEMO-SUPER-ADMIN` | `super_admin`        | `Demo-SuperAdmin-2026!` |

When using a Windows VPN HTTP proxy, configure Docker Desktop's containers
proxy as `http://host.docker.internal:7897` (not `127.0.0.1:7897`) before the
first pull. See the [Windows Docker Compose guide](docs/development/windows-docker-compose.md)
for the reason and full startup checks.
The same Compose workflow is supported on Windows, macOS, and Linux with
Docker Desktop or Docker Engine using Linux containers. See the
[cross-device development guide](docs/development/cross-device-development.md)
for the complete bootstrap and Codex configuration checks.

## GitHub Delivery Workflow

Development work is integrated through `development` and released through `main`.
Use a phase-level `feature/phase-XX-*` branch, keep each task in its own
Conventional Commit, and update one Draft PR as the phase progresses. Feature
PRs are squash-merged into `development`; release branches enter `main` through
a release PR. See the [branching and delivery guide](docs/development/git-branching.md)
and the [pull request template](.github/pull_request_template.md) for the
required gates, review evidence, rollback procedure, and naming rules.

GitHub Actions is the authoritative CI/CD platform. Pull requests require the
`verify` and `container-smoke` checks. Semantic version tags publish immutable
SHA-tagged images to GHCR and attach a release manifest containing image
digests, SBOM, and provenance evidence. Production release approval is
protected by the `production` GitHub Environment.

## Project Documents

- [Approved design specification](docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md)
- [V1 program roadmap](docs/superpowers/plans/2026-07-31-ai-hub-v1-program-roadmap.md)
- [Phase 1 foundation plan](docs/superpowers/plans/2026-07-31-ai-hub-phase-01-foundation.md)
- [Windows Docker Compose guide](docs/development/windows-docker-compose.md)
- [Cross-device development guide](docs/development/cross-device-development.md)
- [Branch migration and GitHub governance record](docs/development/branch-migration-2026-08-05.md)
- [ADR 0001: React SPA and NestJS modular monolith](docs/adr/0001-modular-monolith.md)
- [ADR 0002: PostgreSQL transactional outbox](docs/adr/0002-postgres-outbox.md)
- [ADR 0003: Garage object storage](docs/adr/0003-garage-object-storage.md)
