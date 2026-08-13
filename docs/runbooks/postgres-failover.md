# PostgreSQL 复制、备份、恢复与提升 Runbook

这是操作流程与证据契约，并不表示仓库中存在生产主备对。

## 配置（Provisioning）

1. 选择经批准的私有复制 CIDR，并替换 `infra/postgres/pg_hba.production.conf` 中的示例 `10.20.0.0/24`；复制绝不允许使用 `0.0.0.0/0`。
2. 在主库上创建专用 `replicator` 角色（带 `REPLICATION` 与 `LOGIN`），密码存储在仓库之外，并创建物理复制槽。挂载 `primary.conf`、`pg_hba.production.conf` 与独立的 WAL 归档目录。
3. 由 PostgreSQL 管理员在业务数据库中运行 `infra/postgres/bootstrap-application-roles.sql`，通过受保护的临时 `psql` 变量注入四个互不复用的密码。该脚本幂等创建并收敛 `ai_hub_migration`、`ai_hub_api`、`ai_hub_worker`、`ai_hub_observability`；不得把密码写入命令历史或发布日志。
4. 使用 `ai_hub_migration` 执行 `corepack pnpm init:production`。每次 migration 后再次运行 bootstrap，以收紧新增对象的 runtime 权限，随后运行 `infra/postgres/verify-application-roles.sql`；任何异常都会让发布门禁失败。
5. 从主库向备库数据卷执行一次全新的 `pg_basebackup`。通过仅宿主机可见的 `pgpass`/`postgresql.auto.conf` 文件写入 `primary_conninfo` 与复制密码。挂载 `standby.conf`，并让备库与应用 DNS 名隔离（fenced）。
6. 在提供任何流量前，确认 `pg_stat_replication`、重放时间戳、归档新鲜度与复制延迟。

## 备份与恢复

在独立存储上使用计划任务执行加密物理基础备份加 WAL 归档。备份作业只能证明“备份介质被创建”：记录 `backupId`、来源数据库标识、开始/结束时间、SHA-256 与 WAL 归档范围。`pg_basebackup` 或文件校验成功不能单独证明可恢复。

真实恢复演练必须把备份和所需 WAL 恢复到不接收业务流量、与来源数据库标识不同的隔离目标。恢复命令退出码为零后，在该目标运行：

```powershell
psql --set ON_ERROR_STOP=on --set EXPECTED_LATEST_MIGRATION=<待发布版本的最新 migration 名称> --file infra/postgres/verify-restored-database.sql
```

校验脚本验证仓库真实对象：`kysely_migration`、`kysely_migration_lock`、五类审计表、`outbox_events`、身份/应用/需求/分析关键表，并检查应用版本、需求与应用关联、Outbox 状态完整性。证据包再交给 `validateBackupEvidence()` 校验以下机器可读字段：来源/恢复目标、隔离声明、备份与恢复时间窗口、恢复退出码、迁移数量与最新 migration、逐关系可读结果、三个完整性计数。不存在的 `schema_migrations` 与单一 `audit_events` 不属于本仓库证据。

仓库测试只证明 SQL 与 JSON 契约存在，不会启动真实恢复、读取生产备份介质或修改生产角色。只有隔离目标上由操作人员留存的原始命令输出、日志、校验和与审批记录才构成 restore drill 证据。

## 手动提升

1. 确认主库已在进程、主机与内部 DNS 各层隔离（fenced）。
2. 确认最新备份与 WAL 归档不超过 15 分钟，且已测量复制延迟。
3. 停止备库重放，手动提升，验证迁移/就绪状态，然后仅在已提升主机上启动 API/Worker。
4. 健康检查通过后切换内部 DNS，记录 DNS TTL 与首个成功请求，并保留旧主库作为已隔离（fenced）的证据。
5. 重新加入前，从全新基础备份重建原主库。

仓库目前缺少两台 Ubuntu 主机、独立备份介质、复制凭据与 DNS 区域。在完成真实提升与恢复测量之前，RPO 15 分钟与 RTO 2 小时仍只是目标，而非已通过的门禁。
