# Portal app 存量数据对账与修复

`pnpm reconcile:portal-apps` 用于审计早期 Portal 直接写入 `applications`、`application_drafts` 与 `application_versions` 后可能留下的不变量问题。它不会修改 migration，也不会自行连接或修改生产环境；命令只使用操作者显式提供的 `DATABASE_URL`。

## 执行方式

默认与 `--dry-run` 一样只读，不写 `applications`、安全审计或 Outbox：

```powershell
pnpm reconcile:portal-apps
pnpm reconcile:portal-apps --dry-run
```

输出包含 `findings`、`repairableCount` 与 `manualReviewCount`。先人工核对输出，再以 dry-run 的 `repairableCount` 作为显式确认值执行：

```powershell
pnpm reconcile:portal-apps --apply --expected-count 12
```

`--apply` 会在单一事务内进行 CAS 修复；若实际数量与 `--expected-count` 不一致，或任一行在审计后被并发变更，整批不写入。成功输出的 `batchId` 是回滚凭据：

```powershell
pnpm reconcile:portal-apps --rollback-batch <batchId>
```

回滚只会恢复仍等于该批次 `after` 快照的行；已经恢复的行按幂等跳过，之后被其他业务操作更新的行会以冲突失败，避免覆盖新事实。

## 审计与修复规则

- 仅扫描存在 `portal.app.*` Outbox 事件或 Portal 安全审计记录的应用。
- `current_version_id` 只保留在 `application_reviews` 中存在标准 `approve` 证据的版本；否则恢复最新合法版本或置空。
- 没有 `available`/`claimed` 审核队列支撑的 `pending_version_id` 会清空。
- `in_review` 缺少有效审核队列、`approved`/`published` 缺少合法当前版本，或异常 `withdrawn` 没有任何发布事实时，曾有标准或 Portal 发布事件的应用回退到 `withdrawn`，其他应用回退到 `draft`。
- 无法确定事实（例如审核通过记录引用缺失版本、资源状态与仍有效审核队列相冲突）仅报告到 `manualReviewCount`，不会伪造审核结论或自动修改。
- 每条修复均写入 `security_audit_events`，其中 `details` 保存 `batchId` 与 `before/after` 快照；同时发出幂等 `application.reconciled` Outbox 事件。

历史版本、草稿、评论和收藏不会被删除。旧 `portal.app.*` Worker 处理器仍保留，直至历史 Outbox 排空后再由独立变更移除。
