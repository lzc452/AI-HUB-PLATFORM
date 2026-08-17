# Artifact Intake 异常分支回归证据

执行日期：2026-08-15（Asia/Shanghai）

命令：

```text
pnpm --filter @ai-hub/server exec vitest run src/application/artifact-verification.worker.test.ts
pnpm --filter @ai-hub/api exec vitest run test/artifact-upload.e2e-spec.ts
```

结果：

- `ArtifactVerificationWorker`：7/7 通过。
- 覆盖 `DIGEST_MISMATCH`、`ARTIFACT_SECURITY_UNAVAILABLE`、`MALWARE_DETECTED`、`INVALID_SIGNATURE`、`STORAGE_FINALIZE_FAILED`、stale verification recovery、staging 清理与 Audit/Outbox。
- Artifact API：9/9 通过。
- 并发 `complete` 使用 CAS claim：两次并发请求的状态为一个 `200`、一个 `400 ARTIFACT_COMPLETE_CONFLICT`，最终记录保持 `verifying`，没有重复 claim。

限制：这些是内存 adapter/API 测试证据；Garage copy failure、恶意样本和并发 CAS 尚未在 Compose 真实容器中注入并保存 trace，仍属于 UNDO/TODO。
