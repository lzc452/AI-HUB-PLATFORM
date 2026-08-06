# Windows Docker Compose development

## Requirements

- Windows 11 with Docker Desktop running Linux containers.
- Docker Compose v2 (`docker compose`).
- Git configured to keep repository text files as LF where `.gitattributes` requires it.
- Available local ports: `8080`, `5432`, `3900`, and `3903` by default. This
  workspace uses `5433` for PostgreSQL because another local container already
  occupies `127.0.0.1:5432`.

Garage runs as a single-node S3-compatible development service. It has no data redundancy and is not a production topology. ClamAV, PostgreSQL, Garage, API, worker, Web, and the reverse proxy share one private Compose network.

## VPN and Docker Desktop proxy

If Windows uses a local HTTP proxy for VPN access, Docker Desktop must be able to
reach that proxy from its Linux engine. In Docker Desktop, open **Settings →
Resources → Proxies**, select **Manual configuration** for the containers proxy,
and use the host gateway rather than `127.0.0.1`:

```text
HTTP proxy:  http://host.docker.internal:7897
HTTPS proxy: http://host.docker.internal:7897
```

`127.0.0.1` inside a Linux container refers to the container/engine, not Windows.
Docker pulls always use the Docker Desktop containers proxy, so a proxy that only
works in PowerShell can still leave `docker compose build` unable to fetch its
base image. Keep the VPN enabled while doing the first image pull; after the
image is cached, normal source-only restarts do not need to download it again.

## First startup

The repository includes a local `.env` ignored by Git. To recreate it:

```powershell
Copy-Item .env.example .env
```

Review every value before sharing the stack with another machine. Then start the development environment:

```powershell
docker pull node:24.15.0-bookworm-slim
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
docker compose -f compose.yaml -f compose.dev.yaml ps
Invoke-RestMethod http://127.0.0.1:8080/internal/health/ready
```

The Compose network still uses PostgreSQL at `postgres:5432`; `POSTGRES_PORT`
only changes the host-side port. If `5432` is free on another machine, set
`POSTGRES_PORT=5432` in `.env` or remove the local override.

Open `http://127.0.0.1:8080`. Garage's S3 API is available at `http://127.0.0.1:3900`; its admin API is on `http://127.0.0.1:3903`. PostgreSQL is exposed on `127.0.0.1:5433` in this workspace, or the value of `POSTGRES_PORT`.

Application and shared-package source directories are bind-mounted for hot reload. After changing a package manifest or `pnpm-lock.yaml`, rerun the first-start command to rebuild dependencies; database and object-storage volumes are preserved.

## Migrations

The API applies migrations before it starts. To run them again explicitly:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml exec api pnpm migrate
```

Migrations are idempotent and use `DATABASE_URL` from the container environment.

## Tests

The isolated test project uses its own Compose project name and named volumes:

```powershell
docker compose -f compose.yaml -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test
docker compose -f compose.yaml -f compose.test.yaml down -v
```

The test service runs `pnpm verify`, which is completed in Phase 1 Task 10. Its Docker network is internal, has no Docker socket, and uses the isolated Compose PostgreSQL through `TEST_DATABASE_URL`. The test image includes only the Docker CLI and Compose plugin needed for static Compose validation.

## Logs and shutdown

```powershell
docker compose -f compose.yaml -f compose.dev.yaml logs -f api worker proxy
docker compose -f compose.yaml -f compose.dev.yaml down
```

Use `docker compose ... ps` before inspecting individual logs. A first ClamAV start can take longer while its database is initialized.

## Data reset

Warning: the following command permanently deletes the local PostgreSQL database, Garage objects and metadata, and ClamAV definitions for this project.

```powershell
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

Run the first-start command again to create clean volumes.
