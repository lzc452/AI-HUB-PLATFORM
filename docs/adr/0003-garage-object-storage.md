# ADR 0003: Use Garage for local S3-compatible object storage

- Status: Accepted
- Date: 2026-07-31

## Context

Phase 1 originally pinned `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z`. The source release exists, but MinIO did not publish that container image; `docker manifest inspect` returns `no such manifest`. The MinIO community repository is now archived and documents community distribution as source-only, so pinning an older image would miss the security release while building MinIO from source would add a separate container supply chain to this foundation phase.

The local stack still needs a maintained, prebuilt, S3-compatible service with deterministic development credentials, persistent test data, health checks, and Windows Docker Desktop support.

## Decision

Use the official multi-architecture `dxflrs/garage:v2.3.0` image for Phase 1 development and test stacks.

- Run Garage as a single node with one default bucket; this is explicitly a development/test topology, not a production durability design.
- Persist both Garage metadata and object data in named volumes.
- Keep the application-facing contract S3-compatible and use Garage's S3 API on port `3900`.
- Keep RPC, admin, and default bucket credentials in `.env`; Garage's documented environment overrides provide RPC and admin secrets without committing them to `garage.toml`.
- Pin ClamAV separately to the official `clamav/clamav:1.4.5-debian` image rather than a mutable `1.4_base` line tag.

## Consequences

- Developers no longer depend on an unpublished or historical MinIO image.
- The local object store has no MinIO Console. Garage's admin API and CLI replace that operational surface.
- Garage does not implement every Amazon S3 extension. Phase 1 integrations must remain within Garage's documented compatibility set and test the operations they consume.
- The single-node layout has no redundancy and must not be presented as a production deployment.
- A future production-storage decision remains independent and may select a managed S3 service or another compatible implementation without changing the application contract.

## Rejected alternatives

- **Build MinIO from the 2025-10-15 source tag:** preserves MinIO semantics but adds a slow, security-sensitive image build owned by this repository after upstream moved to source-only distribution.
- **Pin the last historical MinIO container:** simpler, but it predates the referenced security release and is no longer maintained.
- **Use `latest`:** violates reproducibility and the Phase 1 plan's explicit image-pinning requirement.
- **Use SeaweedFS or Ceph:** both can expose S3 APIs, but introduce a broader operational surface than the single-node development stack needs.

## Sources

- [MinIO releases and source-only container instructions](https://github.com/minio/minio/releases)
- [MinIO community repository source-only notice](https://github.com/minio/minio)
- [Garage v2.3 quick start and official container](https://garagehq.deuxfleurs.fr/documentation/)
- [Garage configuration and secret environment overrides](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/)
- [Official Garage image tags](https://hub.docker.com/r/dxflrs/garage/tags)
- [Official ClamAV image tags](https://hub.docker.com/r/clamav/clamav/tags)
