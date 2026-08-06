# PostgreSQL 复制、备份、恢复与提升 Runbook

这是操作流程与证据契约，并不表示仓库中存在生产主备对。

## 配置（Provisioning）

1. 选择经批准的私有复制 CIDR，并替换 `infra/postgres/pg_hba.production.conf` 中的示例 `10.20.0.0/24`；复制绝不允许使用 `0.0.0.0/0`。
2. 在主库上创建专用 `replicator` 角色（带 `REPLICATION` 与 `LOGIN`），密码存储在仓库之外，并创建物理复制槽。挂载 `primary.conf`、`pg_hba.production.conf` 与独立的 WAL 归档目录。
3. 从主库向备库数据卷执行一次全新的 `pg_basebackup`。通过仅宿主机可见的 `pgpass`/`postgresql.auto.conf` 文件写入 `primary_conninfo` 与复制密码。挂载 `standby.conf`，并让备库与应用 DNS 名隔离（fenced）。
4. 在提供任何流量前，确认 `pg_stat_replication`、重放时间戳、归档新鲜度与复制延迟。

## 备份与恢复

在独立存储上使用计划任务执行加密物理基础备份加 WAL 归档。每个备份都要记录 `backupId`、开始/结束时间、SHA-256、归档范围、恢复时间戳，以及验证过的 `schema_migrations`、`audit_events`、`outbox_events` 与 `analytics_daily_aggregates`。未经验证恢复的备份不构成恢复证据。

## 手动提升

1. 确认主库已在进程、主机与内部 DNS 各层隔离（fenced）。
2. 确认最新备份与 WAL 归档不超过 15 分钟，且已测量复制延迟。
3. 停止备库重放，手动提升，验证迁移/就绪状态，然后仅在已提升主机上启动 API/Worker。
4. 健康检查通过后切换内部 DNS，记录 DNS TTL 与首个成功请求，并保留旧主库作为已隔离（fenced）的证据。
5. 重新加入前，从全新基础备份重建原主库。

仓库目前缺少两台 Ubuntu 主机、独立备份介质、复制凭据与 DNS 区域。在完成真实提升与恢复测量之前，RPO 15 分钟与 RTO 2 小时仍只是目标，而非已通过的门禁。
