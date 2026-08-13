# 生产密钥

在仅宿主机可见的目录（例如 `/etc/ai-hub/secrets`）下按“一个密钥一个文件”存放，属主为 `root`，组权限仅部署操作人员可读，权限为 `0600`。生产 env 示例引用的文件都是必需的：`database_url`（仅 `ai_hub_api`）、`worker_database_url`（仅 `ai_hub_worker`）、`cookie_secret`、`db_password`（PostgreSQL 初始化管理员，仅数据库容器使用）、`garage_admin_token`、`garage_access_key`、`garage_secret_key`、`garage_metrics_token`、`garage_rpc_secret`、`tls_certificate`、`tls_private_key`、`postgres_exporter_dsn`（仅 `ai_hub_observability`）与 `grafana_admin_password`。

`ai_hub_migration` DSN 只在发布窗口由外部 secret provider 临时注入 migration 命令，不挂载到 API、Worker、监控或数据库长运行容器。四个应用数据库角色必须使用不同随机密码并分别轮换；轮换后运行 `infra/postgres/verify-application-roles.sql` 留存权限证据。

绝不要提交这些文件、把密钥值写入 Compose YAML，或复用 `compose.yaml` 中的开发默认值。只有在阶段 7 台账中记录了密钥清单、轮换负责人、备份处理与恢复测试后，主机才算生产就绪。
