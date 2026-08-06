# 生产密钥

在仅宿主机可见的目录（例如 `/etc/ai-hub/secrets`）下按“一个密钥一个文件”存放，属主为 `root`，组权限仅部署操作人员可读，权限为 `0600`。生产 env 示例引用的文件都是必需的：`database_url`、`cookie_secret`、`db_password`、`garage_admin_token`、`garage_access_key`、`garage_secret_key`、`garage_metrics_token`、`garage_rpc_secret`、`tls_certificate`、`tls_private_key`、`postgres_exporter_dsn` 与 `grafana_admin_password`。

绝不要提交这些文件、把密钥值写入 Compose YAML，或复用 `compose.yaml` 中的开发默认值。只有在阶段 7 台账中记录了密钥清单、轮换负责人、备份处理与恢复测试后，主机才算生产就绪。
