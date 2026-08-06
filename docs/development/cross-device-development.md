# 跨设备开发

仓库在 Windows、macOS 与 Linux 上使用相同的 Node、pnpm 与 Docker 基线：

- Node.js `24.15.0`（来自 `.node-version`）。
- pnpm `10.34.5`（来自 `package.json` 与 Corepack）。
- 使用 Linux 容器的 Docker Compose。
- 仓库自有的 `.codex/` 下 Codex 配置。

## 全新检出

```sh
git clone https://github.com/lzc452/AI-HUB-PLATFORM.git
cd AI-HUB-PLATFORM
git switch development
corepack enable
corepack pnpm install --frozen-lockfile
```

创建被忽略的本地环境文件：

```sh
cp .env.example .env
```

在 PowerShell 中请改用 `Copy-Item .env.example .env`。启动环境前请检查本地值；绝不提交 `.env`。

运行仓库检查并启动开发服务：

```sh
corepack pnpm governance:check
corepack pnpm verify
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
```

应用地址为 `http://127.0.0.1:8080`。日志、迁移、测试与卷重置流程请使用现有的 [Windows Docker 指南](windows-docker-compose.md)。

## Codex 配置

`.codex/` 目录是项目配置，随 Git 仓库一起分发。`.codex/cache/`、`.codex/local/`、密钥文件与机器路径被排除在外。添加或修改 skill 后运行 `corepack pnpm governance:check`。用户级插件与凭据必须在每台设备上单独配置。

## 设备交接检查清单

- [ ] Docker 正在运行 Linux 容器。
- [ ] Node 解析为 `24.15.0`，Corepack 激活 pnpm `10.34.5`。
- [ ] `corepack pnpm install --frozen-lockfile` 成功。
- [ ] 已在本地创建 `.env` 且未暂存。
- [ ] `corepack pnpm governance:check` 成功。
- [ ] `corepack pnpm verify` 成功。
- [ ] 开发 Compose 健康端点有响应。
