# 生产安全边界 Runbook


## TLS 与代理

`infra/docker/nginx.production.conf` 将 HTTP 重定向到 HTTPS，终止 TLS 1.2/1.3，输出 HSTS/CSP/frame/content/referrer/permissions 安全头，并对内部 API 路径限流。证书与密钥是宿主机挂载的密钥；仓库中不包含生产证书。DNS 切换前，使用经批准的镜像运行代理语法检查，并记录证书有效期、主机名覆盖范围与外部 TLS 扫描结果。


## CSRF

生产环境的状态变更请求要求配置为同源的 `Origin`、`csrf_token` Cookie 与匹配的 `x-csrf-token` 头。安全方法不受双重提交（double-submit）检查约束。API 中间件仅在 `NODE_ENV=production` 时启用；测试夹具并不能证明已部署主机受到保护。


## SSRF

出站 HTTP 适配器在连接前必须调用 `assertPublicHttpTarget`。该策略只允许 HTTP(S)，拒绝带凭据的 URL、回环/链路本地/私有/ULA/云元数据目标，并拒绝任何解析到私有地址的 DNS 应答。若提供商执行独立的连接步骤，调用方必须在连接前立即重新解析。


## 防重放

状态变更请求要求提供 `x-request-nonce` 与服务器时间五分钟内的 ISO 时间戳。nonce 经 SHA-256 哈希后以唯一键插入 PostgreSQL `request_replay_nonces` 表，因此两台生产主机无需 Redis 即可共享重放边界。重复请求返回冲突；过期行在消费时清理。

安全测试证明了策略行为与迁移/类型边界。真实的生产声明还需要通过活动 DNS 名称执行双主机 API 请求测试，并提供备库共享同一 PostgreSQL 重放表的证据。
