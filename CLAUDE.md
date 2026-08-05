# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Hub Platform — a pnpm monorepo for an enterprise AI application sharing platform. Three deployable apps (React SPA, NestJS API, NestJS outbox worker) share packages in a modular monolith. Node.js 24.15.0 is the baseline; Node.js ≥18.18 is supported.

## Essential Commands

```bash
# Install dependencies
corepack pnpm install --frozen-lockfile

# Full verification pipeline (format → lint → typecheck → boundaries → test → build → doc-links → governance → compose config)
corepack pnpm verify

# Individual checks
pnpm format:check          # Prettier
pnpm lint                   # Turbo runs ESLint across all workspaces
pnpm typecheck              # Turbo runs tsc --noEmit across all workspaces
pnpm boundaries             # dependency-cruiser module boundary check
pnpm test                   # Node test runner for scripts + vitest for workspaces (serial)
pnpm build                  # Turbo build all workspaces
pnpm migrate                # Run Kysely migrations against DATABASE_URL

# Single workspace commands (run from root)
pnpm --filter @ai-hub/api test
pnpm --filter @ai-hub/api lint
pnpm --filter @ai-hub/database test

# Start development stack (app at http://127.0.0.1:8080)
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600

# Run CI test suite in containers
docker compose -f compose.yaml -f compose.test.yaml run --rm test
```

## Monorepo Structure

```
apps/
  api/         @ai-hub/api      — NestJS API entrypoint, assembles modules via ApiModule.register()
  web/         @ai-hub/web      — React SPA (Vite + React Router + Ant Design + Tailwind)
  worker/      @ai-hub/worker   — NestJS outbox worker, polls outbox_events and dispatches handlers
packages/
  config/      @ai-hub/config   — Zod-validated RuntimeConfig from environment variables
  contracts/   @ai-hub/contracts — Shared TypeScript types (no runtime deps)
  database/    @ai-hub/database — Kysely schema, migrations, OutboxStore
  server/      @ai-hub/server   — All domain logic: NestJS modules, services, controllers, repositories
  testing/     @ai-hub/testing  — Testcontainers helper (PostgreSQL)
  ui/          @ai-hub/ui       — Ant Design theme tokens
```

### Dependency Rules (enforced by dependency-cruiser)

- `@ai-hub/contracts` is a leaf — no runtime deps
- `@ai-hub/config` depends only on `zod`
- `@ai-hub/database` depends on `contracts`, `kysely`, `pg`
- `@ai-hub/server` depends on `contracts`, `database`, `pino`, NestJS
- Apps depend on packages but not on each other
- Domain modules inside `server` must not import infrastructure concerns (NestJS controllers, HTTP) from other domain modules

## Architecture Patterns

### Domain Module Pattern

Every domain module (identity, application, catalog, interaction, notification, creator, demand, analytics) in `packages/server/src/<domain>/` follows the same structure:

- **`<domain>.module.ts`** — NestJS `DynamicModule` with `static register(databaseUrl)` and `static forTest(mock)` factories. Production wiring creates real Kysely repositories; test wiring accepts mock services.
- **`<domain>.service.ts`** — Pure business logic. Depends on repository interfaces and port abstractions (not on NestJS or HTTP).
- **`<domain>.controller.ts`** — NestJS controller. Thin delegation to the service; extracts headers/params, passes to service, transforms results.
- **`<domain>.repository.ts`** — Kysely implementation of the repository interface.
- **`<domain>.types.ts`** — Repository interfaces, port interfaces, and domain types. Repositories have `withTransaction()` for atomicity.
- **`<domain>.tokens.ts`** — (Optional) NestJS injection tokens when abstract classes/interfaces need a DI symbol.

### Module Registration

`ApiModule.register(databaseUrl)` is the composition root — it creates a fresh Kysely instance per module. This means each domain module gets its own database connection pool (max 10 each). The `forTest()` static method on each module accepts pre-built mock services, enabling isolated integration tests.

### Authorization Model

`IdentityService.authorize()` performs RBAC: `super_admin` bypasses all checks; other roles match `{resourceType}.{action}` permissions. An `AudienceEvaluator` callback gates department-scoped visibility — replaced in tests.

### Transactional Outbox

Background work (e.g., DingTalk notifications) is recorded atomically in `outbox_events` within the same database transaction as the originating change. The worker polls via `SELECT ... FOR UPDATE SKIP LOCKED`, dispatches to registered handlers, and records completion/failure. Handlers must be idempotent — delivery is at-least-once.

### Web App

React SPA with React Router, Ant Design components, Tailwind CSS, and TanStack Query for server state. Currently a static shell — most pages are placeholder UIs representing planned feature areas. The app uses Ant Design's `ConfigProvider` with a custom theme from `@ai-hub/ui` and `zh_CN` locale.

## Testing

- **Unit tests**: In-memory repository implementations (e.g., `MemoryIdentityRepository` inside the test file). Services are tested in isolation; no database required.
- **Integration tests**: Use `@ai-hub/testing` → `startPostgresTestContainer()` which spawns a testcontainers PostgreSQL instance. Set `TEST_DATABASE_URL` to use a shared database instead.
- **Test runner**: Vitest (`vitest run`) for workspace packages. Node built-in test runner (`node --test`) for scripts.
- **Test file convention**: Co-located `*.test.ts` files. Integration tests use `*.integration.test.ts`.

## Infrastructure Services (Docker Compose)

| Service | Purpose |
|---------|---------|
| PostgreSQL 18.4 | Primary database (Kysely ORM) |
| Garage v2.3 | S3-compatible object storage (dev/test only) |
| ClamAV 1.4.5 | Malware scanning for uploaded artifacts |
| Prometheus | Metrics collection from API and worker |
| nginx | Reverse proxy, routes to web and API |

## Key Design Decisions (ADRs)

- **ADR 0001**: React SPA + NestJS modular monolith (not Next.js, not microservices)
- **ADR 0002**: PostgreSQL transactional outbox for background work (not Redis/AMQP)
- **ADR 0003**: Garage for local S3-compatible storage (MinIO image was unavailable)
