# 生产 Compose 部署 Runbook

本 runbook 是阶段 7 的运维产物，并不构成任一 Ubuntu 主机已部署的证据。它必须在主机、DNS、TLS、镜像仓库、密钥与备份前置条件获批后，分别在活动与备主机上执行。

1. 将对应的 `infra/production/*.env.example` 复制为仅宿主机可见的 env 文件。
2. 按 `infra/production/secrets/README.md` 列出的内容创建所有文件，权限为 `0600`；确认不存在任何开发兜底值。
3. 将每个镜像解析为 CI 产出的摘要，并在发布证据目录中记录摘要/SBOM。
4. 运行：

   ```powershell
   node scripts/production/validate-config.mjs
   docker compose --env-file /etc/ai-hub/production.env -f compose.production.yaml config --quiet
   docker compose --env-file /etc/ai-hub/production.env -f compose.production.yaml pull
   docker compose --env-file /etc/ai-hub/production.env -f compose.production.yaml up --detach
   ```

4.5. 由 PostgreSQL 管理员执行数据库角色 bootstrap。密码通过受保护的 `psql` 变量提供，不写入仓库、Compose 或日志；示例仅展示变量名：

   ```powershell
   psql --set ON_ERROR_STOP=on --set AI_HUB_DATABASE=ai_hub --set AI_HUB_MIGRATION_DB_PASSWORD=:secret --set AI_HUB_API_DB_PASSWORD=:secret --set AI_HUB_WORKER_DB_PASSWORD=:secret --set AI_HUB_OBSERVABILITY_DB_PASSWORD=:secret --file infra/postgres/bootstrap-application-roles.sql
   ```

   生产执行时应从获批的 secret provider 建立临时 `psql` 变量，不能照抄 `:secret`。完成后分别生成 migration、API、Worker 与 postgres-exporter 的 DSN 文件。

4.6. 仅使用 `ai_hub_migration` 的 `DATABASE_URL` 执行生产环境初始化（只做 migration，不写入演示或业务数据）：

   ```powershell
   corepack pnpm init:production
   ```

   该命令在容器外针对生产 `DATABASE_URL` 一次性运行；生产 Compose 不会自动执行初始化。完成后重新运行 `bootstrap-application-roles.sql`，再执行：

   ```powershell
   psql --set ON_ERROR_STOP=on --file infra/postgres/verify-application-roles.sql
   ```

   API 的 `database_url` 必须使用 `ai_hub_api`，Worker 的 `worker_database_url` 必须使用 `ai_hub_worker`，`postgres_exporter_dsn` 必须使用 `ai_hub_observability`。migration DSN 不得挂载到长运行容器。

5. 确认代理健康、API 就绪、数据库迁移门禁、worker 健康与 DNS 健康检查状态。在数据库、对象存储、备份与可观测性检查全部为绿色之前，不要切换内部 DNS。

当前仓库不包含实际主机、DNS 区域、TLS 证书、生产凭据或镜像仓库签名。这些缺失输入必须保持为显式的部署阻断项，而不能由本地 Compose 配置检查推断为已具备。
