# Windows Docker Compose development

## Requirements

- Windows 11 with Docker Desktop running Linux containers.
- Docker Compose v2 (`docker compose`).
- Git configured to keep repository text files as LF where `.gitattributes` requires it.
- Available local ports: `8080`, `5432`, `3900`, and `3903` by default.

Garage runs as a single-node S3-compatible development service. It has no data redundancy and is not a production topology. ClamAV, PostgreSQL, Garage, API, worker, Web, and the reverse proxy share one private Compose network.

## First startup

The repository includes a local `.env` ignored by Git. To recreate it:

```powershell
Copy-Item .env.example .env
```

Review every value before sharing the stack with another machine. Then start the development environment:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
docker compose -f compose.yaml -f compose.dev.yaml ps
Invoke-RestMethod http://127.0.0.1:8080/internal/health/ready
```

Open `http://127.0.0.1:8080`. Garage's S3 API is available at `http://127.0.0.1:3900`; its admin API is on `http://127.0.0.1:3903`. PostgreSQL is exposed on `127.0.0.1:5432`.

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

The test service runs `pnpm verify`, which is completed in Phase 1 Task 10. It disables configured external integrations and mounts the Docker socket only so the existing Testcontainers integration suite can create isolated PostgreSQL containers.

## Logs and shutdown

```powershell
docker compose -f compose.yaml -f compose.dev.yaml logs -f api worker proxy
docker compose -f compose.yaml -f compose.dev.yaml down
```

Use `docker compose ... ps` before inspecting individual logs. A first ClamAV start can take longer while its database is initialized.

## Data reset

Warning: the following command permanently deletes the local PostgreSQL database, Garage objects and metadata, ClamAV definitions, and cached container workspace dependencies for this project.

```powershell
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

Run the first-start command again to create clean volumes.
