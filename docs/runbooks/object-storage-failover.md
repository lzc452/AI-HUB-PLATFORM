# Object-storage replication, cutover, and restore runbook

The production storage boundary uses two private S3-compatible Garage sites
and host-level asynchronous replication. Replication is deliberately
manifest/checksum based and does not add a message queue.

## Replication

1. Create versioned, encrypted, non-public source and target buckets with
   different credentials and record the bucket versioning/encryption policy.
2. Export a sorted object/version manifest and SHA-256 digest from the source.
3. Run the approved host replication tool with checksum and immutable-version
   options, then export the target manifest. Compare digests before declaring a
   replication cycle complete.
4. Record the newest source object timestamp, target completion timestamp,
   object count, byte count, digest, and operator. The difference is the
   measured object-storage replication lag and contributes to RPO evidence.

An example host-side command shape is:

```text
rclone sync s3-primary:ai-hub s3-secondary:ai-hub --checksum --immutable --s3-no-check-bucket
```

The actual endpoint, credentials, TLS CA, and retention policy are supplied by
operations and are not stored in this repository.

## Cutover and restore

1. Fence writes to the source application/storage endpoint.
2. Confirm target health, verified manifest, no version conflicts, and a recent
   restore of a representative Phase 3–6 artifact.
3. Switch the storage endpoint in the host-only configuration, then verify
   object read, signed delivery, audit metadata, and malware-scan flow.
4. Keep the source fenced until the reverse manifest comparison is complete.
5. To roll back, fence the target and restore the previous endpoint; never
   merge divergent object versions without an explicit operator decision.

The repository currently has no production Garage sites, replication
credentials, independent storage medium, or completed cutover/restore drill.
The object-storage target therefore remains unverified even though the policy
and manifest tests pass.
