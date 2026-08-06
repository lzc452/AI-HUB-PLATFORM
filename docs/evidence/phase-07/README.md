# 阶段 7 证据包

每个获批的演练或部署窗口创建一个不可变的证据目录。不要在仓库中存放凭据、私钥、令牌或客户数据。

必需文件：

- `metadata.json`：演练 ID、场景、操作人员、审批人、UTC 时间戳、提交 SHA、主机标识与声明的 RPO/RTO 测量值。
- `events.json`：有序的故障、隔离（fencing）、切换/提升、健康与恢复事件。
- `checksums.txt`：备份与对象清单的校验和。
- `alerts/`：Alertmanager 通知与恢复证据。
- `logs/`：脱敏的命令输出与集中日志查询证据。
- `signoff.md`：偏差、未解决发现项与操作人员/审批人签核。

捕获证据包后，通过经批准的证据收集包装器运行 `node scripts/production/drills/drill-ops.mjs --evidence metadata.json`。本地校验通过是必要条件，但不能替代真实主机、网络、凭据或恢复证据。
