# Artifact Intake 异常注入运行时证据（Compose 隔离环境）

执行时间：2026-08-16（Asia/Shanghai，UTC 记录为 2026-08-15T19:21–19:33）

## 环境与恢复

- Docker Engine：Rancher Desktop（WSL2 发行版 `rancher-desktop`，moby 29.5.3）。
- Windows 侧 `docker_engine` 命名管道仍为只读 ACL，Windows Docker 客户端不可用；
  本轮全部操作改用 `wsl.exe -d rancher-desktop -- docker ...` 直连 `/var/run/docker.sock`。
- 主栈重启后恢复为 8/8 healthy：`postgres`、`garage`、`clamav`、`api`、`worker`、
  `web`、`proxy`、`prometheus`。
- 隔离环境：数据库 `ai_hub_inject`（migration `0031_artifact_runtime_compatibility`，
  demo 账号 5 个）、Garage bucket `ai-hub-inject`（默认密钥 RWO）、
  `ai-hub-inject-api`（端口 3100）与 `ai-hub-inject-worker`。
- 运行时适配器：`GarageObjectStorage` + `ClamAvMalwareScanner` + `Ed25519ArtifactSigner`
  （development 模式每次启动生成临时密钥，故错误签名必然校验失败）。

## 注入方法

| 场景                                              | 注入手段                                                           | 期望错误码                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| 恶意样本                                          | 上传 68 字节标准 EICAR 测试串，真实 ClamAV `INSTREAM` 判定         | `MALWARE_DETECTED`                                          |
| 错误签名                                          | `complete` 请求体携带伪造 Ed25519 签名                             | `INVALID_SIGNATURE`                                         |
| 错误摘要                                          | 通过 S3 `PutObject` 覆写 staging 对象后再 complete                 | `DIGEST_MISMATCH`                                           |
| staging 缺失                                      | 通过 S3 `DeleteObject` 删除 staging 对象后再 complete              | `ARTIFACT_NOT_FOUND`                                        |
| Garage copy 失败                                  | `garage bucket deny --write`（真实 403，读仍可用）后再 complete    | `STORAGE_FINALIZE_FAILED`                                   |
| ClamAV 不可用                                     | `docker stop clamav`（连接被拒）后再 complete                      | `ARTIFACT_SECURITY_UNAVAILABLE`                             |
| ClamAV 超时                                       | `docker pause clamav`（进程冻结、连接无响应）后再 complete         | `ARTIFACT_SECURITY_UNAVAILABLE`                             |
| 并发 complete CAS                                 | 同一上传并行两次 complete，随后第三次                              | 一次 `200 verifying`，其余 `400 ARTIFACT_COMPLETE_CONFLICT` |
| verifying 超时回收                                | 停 worker → complete 卡 `verifying` → 将 Outbox 事件标记 completed |
| 模拟“已认领但落库前崩溃” → 以 60s 租约重启 worker | `recovered` 审计 + 客户端重试后 `completed`                        |

## 结果

| 场景                 | uploadStatus | scanStatus | errorCode                     | verificationAttempts | 最终对象 | staging |
| -------------------- | ------------ | ---------- | ----------------------------- | -------------------- | -------- | ------- |
| control              | completed    | passed     | —                             | 1                    | 是       | 已删除  |
| cas                  | completed    | passed     | —                             | 1                    | 是       | 已删除  |
| eicar                | failed       | failed     | MALWARE_DETECTED              | 1                    | 否       | 保留    |
| bad-signature        | failed       | failed     | INVALID_SIGNATURE             | 1                    | 否       | 保留    |
| digest-mismatch      | failed       | failed     | DIGEST_MISMATCH               | 1                    | 否       | 保留    |
| not-found            | failed       | failed     | ARTIFACT_NOT_FOUND            | 1                    | 否       | 已缺失  |
| storage-copy-fail    | failed       | failed     | STORAGE_FINALIZE_FAILED       | 1                    | 否       | 保留    |
| security-unavailable | failed       | failed     | ARTIFACT_SECURITY_UNAVAILABLE | 1                    | 否       | 保留    |
| security-timeout     | failed       | failed     | ARTIFACT_SECURITY_UNAVAILABLE | 1                    | 否       | 保留    |
| stale                | completed    | passed     | —                             | 2                    | 是       | 已删除  |

- 超时注入：`requested` 审计 19:30:30.654Z → `failed` 审计 19:31:00.722Z，
  间隔 30.07s，与 `CLAMAV_TIMEOUT_MS=30000` 一致。
- 超时回收：19:31:11 卡 `verifying` → 19:32:52.811 `application.artifact.verification.recovered`
  （`actor_employee_id=null`，系统回收）→ 重置 `uploading` 并重排事件 →
  客户端重试 complete（attempts=2）→ 19:32:54.189 `completed`。

## Audit / Outbox 同事务原子性

- 每个失败分支均为 1 条 `application.artifact.verification.requested` +
  1 条 `application.artifact.verification.failed` 审计，对应
  `artifact.verification.requested` / `artifact.verification.failed` Outbox 均 `completed`。
- 成功分支为 1 条 `requested` + 1 条 `completed` 审计与 Outbox。
- 并发 CAS 失败方没有产生任何额外审计或 Outbox 行；最终行仅一次 claim。
- 全库汇总：审计 `requested=11`、`failed=7`、`recovered=1`、`completed=3`；
  Outbox `requested=12`、`failed=7`、`completed=3`；`verification_attempts` 总和 11。
  10 个上传各 claim 一次 + stale 重试一次 = 11；`requested` Outbox 比审计多 1 条为
  reconcile 重排队列（不重复写 requested 审计），数量闭环。

## Staging 清理

- 成功 3 例：staging 对象删除，仅保留 final 对象。
- 失败 7 例：staging 对象按设计保留供重试检查（与单测
  “preserves staging for retry inspection”一致），从未产生 final 对象。
- 注入桶最终清单：3 个 `artifacts/` final 对象 + 6 个失败分支 `uploads/` staging 对象；
  not-found 场景对象为空。

## 文件索引

- `injection-driver.mts`：注入驱动器（在注入 API 容器内运行，直连 Garage/Postgres）。
- `control.json`、`cas.json`、`eicar.json`、`bad-signature.json`、`digest-mismatch.json`、
  `not-found.json`、`storage-copy-fail.json`、`security-unavailable.json`、
  `security-timeout.json`、`stale.json`：逐场景 API 响应、对象清单与数据库行。
- `db-snapshot.txt`：注入库按状态/错误码汇总。
- `inject-api.log`、`inject-worker.log`：隔离 API/worker 完整日志。
- `state.json`：场景状态（应用/上传/对象键）。

## Audit Export 失败态注入（同环境续跑）

| 场景                                                                            | 注入手段                                 | 结果                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| 未就绪下载                                                                      | worker 暂停时创建导出并立即下载          | `404 AUDIT_EXPORT_NOT_READY`；worker 恢复后 `completed` + 下载 `200` NDJSON |
| 生成失败                                                                        | filterSnapshot `{"from":"not-a-date"}`   | `failed`，`failureCode` 为 PostgreSQL 时间戳错误；下载 `404 NOT_READY`      |
| 存储失败                                                                        | `garage bucket deny --write`（真实 403） | `failed`，`failureCode=Forbidden: Operation is not allowed for this key.`   |
| 过期                                                                            | 完成后回拨 `expires_at` 至过去           | 状态仍 `completed` 且 `expiresAt` 过期；下载 `404 AUDIT_EXPORT_EXPIRED`     |
| 文件缺失                                                                        | 删除 `security/audit-exports/*.jsonl`    | 下载 `404 AUDIT_EXPORT_FILE_NOT_FOUND`                                      |
| 失败后重试 CAS                                                                  | 观察 Outbox 重试                         | 两个失败任务 Outbox 均 `completed`、`attempts=2`：第二次                    |
| claim 因 job 非 `queued` 返回空而不重复生成，`last_error=OUTBOX_HANDLER_FAILED` |

- 汇总：`security_audit_export_jobs` completed=3、failed=2；审计
  `security.audit.export.requested=5`、`completed=3`、`failed=2`（result=error、risk=high）。
- 失败任务没有 `result_storage_key`，下载始终 404，不产生可下载假链接。
- 前端补丁（本次完成）：风险等级筛选（low/medium/high 本地过滤并纳入导出快照）、
  导出任务 2s 轮询状态机（queued/processing → completed/failed/expired/poll 超时）、
  completed 才显示下载按钮（`apiFetchBlob` 带身份头），failed/expired 仅提示不提供下载。
  新测试 `useSecurityAudit.test.tsx` 3/3，全量 web 25 文件 105 测试通过，typecheck/lint 通过。

## Notification payload 数据库回放与越权详情

- 空库 `ai_hub_replay` 执行全量 migration：`0029_notification_payload` 按序落地，
  `notifications.payload jsonb not null default '{}'` 与
  `notifications_payload_object_check` 均存在；重复 migration 前后计数 31 → 31，无副作用。
- 重复 demo seed 幂等：两次 `seed:demo-data` 均为
  `identity=9, application=84, catalog=23, demand=24, notification=20, analytics=1110`，
  `check:demo-data` `passed=true`。
- 详情 payload：seeded 通知返回结构化 `payload.{title,body}`；旧版纯文本行
  （`payload='{}'`）仍返回 `message`，前端 Modal 以 `payload?.title ?? meta.title` 回退
  （web `notificationMeta.test.ts` 21 测试覆盖）。
- 收件人越权：`DEMO-EMPLOYEE` 请求 `DEMO-SUPER-ADMIN` 的通知详情返回
  `404 NOTIFICATION_NOT_FOUND`（不泄露存在性）。发现并修复：controller 的 `call()`
  曾把所有域错误映射为 400，现 `NOT_AUTHORIZED → 403`、`NOTIFICATION_NOT_FOUND → 404`、
  其余 400；新增 `notification.controller.test.ts` 3 用例，server 通知模块 14/14 通过。
- 文件索引：`notification-replay-first/second.txt`、`notification-replay-count-before/after.txt`、
  `notification-seed-*.txt`、`filter-generation-failure.json`、容器内 `state.json`。

## Catalog PostgreSQL 性能与受众隔离

- 303 个应用 fixture（300 published + draft/withdrawn/archived 标记）覆盖
  all/department/employee 三种受众；详见 `catalog-runtime-evidence.md`。
- EXPLAIN ANALYZE：audience 过滤在 limit/offset 之前，索引命中
  `applications_catalog_status_idx` / `application_audiences_department_idx`；
  新增 `application_id` tiebreaker 后跨页 total=250/collected=250/unique=250，无重无漏。
- log_statement=all 实测单次 100 条分页请求仅 6 条目录 SQL（1 count + 1 page +
  tags/labels/attachments/deliveries 各 1 条批量 `IN`），无逐行 N+1。
- 五角色列表可见总数 250/280/240/220/220 与受众期望一致；direct-ID 对未发布/撤回/
  归档/非受众资源全部 `404 CATALOG_APPLICATION_NOT_FOUND`。
