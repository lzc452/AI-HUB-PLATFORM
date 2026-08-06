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

5. 确认代理健康、API 就绪、数据库迁移门禁、worker 健康与 DNS 健康检查状态。在数据库、对象存储、备份与可观测性检查全部为绿色之前，不要切换内部 DNS。

当前仓库不包含实际主机、DNS 区域、TLS 证书、生产凭据或镜像仓库签名。这些缺失输入必须保持为显式的部署阻断项，而不能由本地 Compose 配置检查推断为已具备。
