# 生产可观测性 Runbook

Prometheus 通过私有 Compose 网络抓取 API、Worker、PostgreSQL exporter、Garage 与 Loki 的指标。Grafana 配置 Prometheus 与 Loki 只读数据源。Alertmanager 将可用性、安全、备份与复制告警路由到 `oncall-prod`。Promtail 将 Docker 日志发送到 Loki，并应用针对密钥、Cookie、授权、员工标识符与数据库 URL 的脱敏规则。

告警接收人 URL、Grafana 密码、日志存储卷、保留负责人与外部通知凭据都是仅宿主机可见的生产输入。配置测试通过或接收人未连通都不构成已投递告警的证据。

每个事件都要记录告警时间戳、首次确认、恢复时间戳、受影响主机、请求/错误计数、复制/WAL/备份延迟以及由此得出的可用性/RPO/RTO 测量值。日志至少保留 30 天，除非经批准的保留策略要求更长时间。
