# Cross-device development

The repository uses the same Node, pnpm, and Docker baseline on Windows,
macOS, and Linux:

- Node.js `24.15.0` from `.node-version`.
- pnpm `10.34.5` from `package.json` and Corepack.
- Docker Compose with Linux containers.
- Repository-owned Codex configuration under `.codex/`.

## Fresh checkout

```sh
git clone https://github.com/lzc452/AI-HUB-PLATFORM.git
cd AI-HUB-PLATFORM
git switch development
corepack enable
corepack pnpm install --frozen-lockfile
```

Create the ignored local environment file:

```sh
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` instead. Review local values
before starting the stack; never commit `.env`.

Run the repository checks and start the development services:

```sh
corepack pnpm governance:check
corepack pnpm verify
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
```

The application is available at `http://127.0.0.1:8080`. Use the existing
[Windows Docker guide](windows-docker-compose.md) for logs, migrations, tests,
and volume reset procedures.

## Codex configuration

The `.codex/` directory is project configuration and travels with the Git
repository. `.codex/cache/`, `.codex/local/`, secret files, and machine paths
are excluded. Run `corepack pnpm governance:check` after adding or changing a
skill. User-level plugins and credentials must be configured separately on
each device.

## Device handoff checklist

- [ ] Docker is running Linux containers.
- [ ] Node resolves to `24.15.0` and Corepack activates pnpm `10.34.5`.
- [ ] `corepack pnpm install --frozen-lockfile` succeeds.
- [ ] `.env` was created locally and is not staged.
- [ ] `corepack pnpm governance:check` succeeds.
- [ ] `corepack pnpm verify` succeeds.
- [ ] Development Compose health endpoint responds.
