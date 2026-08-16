# V1 Compose 运行时 Smoke 证据

执行时间：2026-08-15（Asia/Shanghai）

## Compose 与数据库

- Rancher `dockerd/moby` 可用，`docker compose up -d --wait` 后 `postgres`、`garage`、`clamav`、`api`、`worker`、`web`、`proxy`、`prometheus` 均为 `healthy`。
- 默认库从历史 0030 漂移状态通过前向兼容 migration `0031_artifact_runtime_compatibility` 补齐 Artifact 运行时列；当前 `kysely_migration=0031`，应用重启后仍保持。
- 隔离库已执行 0001–0030，重复 migration 无副作用；demo seed 连续两次计数保持 `identity=9, application=84, catalog=23, demand=24, notification=20, analytics=1110`，`check:demo-data` 为 `passed=true`。

## 登录与 Artifact Intake

- 登录角色：`DEMO-APP-ADMIN`、`DEMO-SUPER-ADMIN`，均通过 challenge + RSA-OAEP/AES-GCM 登录接口取得真实 session。
- 应用：`9664f180-1acd-4786-85ae-93700d894cd9`
- 上传：`a0ecf8aa-bf61-41eb-91bf-827a3f7db90e`
- SHA-256：`87bd9fae8672db0cb6b6c9eaccca6c746db3b18f7adcf8105470f9517e002c8c`
- staging：`applications/9664f180-1acd-4786-85ae-93700d894cd9/uploads/50a506bb-eef0-43cb-8214-d832ad66c216/content`
- final：`applications/9664f180-1acd-4786-85ae-93700d894cd9/artifacts/a0ecf8aa-bf61-41eb-91bf-827a3f7db90e/content`
- 数据库最终状态：`upload_status=completed`、`scan_status=passed`、`verification_attempts=1`。
- worker 真实经过 Garage S3 object storage 与 ClamAV TCP `INSTREAM`；Garage bucket `ai-hub` 存在。ClamAV adapter 已修复 `stream: OK\0` 和保持连接响应，并由协议单测 2/2 覆盖。
- Audit：`artifact.verification.requested`、`artifact.verification.completed` 均为 `completed`；对应 `artifact.verification.requested/completed` Outbox 均为 `completed`。

## Security Audit Export

- Export job：`bafc8117-2fc5-4844-b71f-eaa8bee4681e`
- 状态：`queued → processing → completed`，对象键 `security/audit-exports/bafc8117-2fc5-4844-b71f-eaa8bee4681e.jsonl`。
- `GET /internal/security/audit-exports/:exportId` 返回 `completed`；download 返回 HTTP 200。
- 响应头：`Content-Type: application/x-ndjson; charset=utf-8`；`Content-Disposition: attachment; filename="audit-export-bafc8117-2fc5-4844-b71f-eaa8bee4681e.jsonl"`。
- 首行包含结构化 `auditEventId/module/action/result/risk/details/createdAt`；Audit 记录含 `security.audit.export.requested` 与 `security.audit.export.completed`。

## 发现并修复的问题

1. 默认库历史 0025 已标记但缺少新增列：新增 0031 前向兼容 migration，不修改历史 migration 记录。
2. ClamAV 返回后不关闭 socket：adapter 改为收到 `stream: OK/FOUND`（含 NUL 终止）立即完成。
3. SecurityController 第一参数缺少显式 `@Inject(IdentityService)`，真实路由中 identity 为 undefined：补齐注入元数据。
4. Audit download 缺少可审计的 NDJSON/附件响应头：补齐 content type 与 disposition。

## 尚未覆盖

- 恶意样本、错误摘要、错误签名、Garage copy 失败和并发 complete 的 Compose 证据仍待补齐。
- 两条浏览器主流程、五角色权限矩阵和 21 张设计图逐图证据仍为 UNDO。

## 正式重建镜像复跑（最终一轮）

- 重新构建并重建 API/worker 后，8 服务仍全部 healthy，数据库保持 `0031_artifact_runtime_compatibility|31`。
- Artifact：应用 `ecbda05d-ef1b-44a2-862b-65cc5b1765d5`，上传 `4d738b75-ec83-4ecd-a4cf-4e79ef19cde3`，最终状态 `completed/passed`。
- Audit export：`99658e6e-fff6-4a86-be64-13c699ddcde9`，状态 `completed`，download `200`，NDJSON 与附件响应头均正确。
