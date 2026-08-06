# ADR 0003：使用 Garage 作为本地 S3 兼容对象存储

- 状态：已接受
- 日期：2026-07-31

## 背景

阶段 1 最初锁定 `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z`。该源码版本存在，但 MinIO 并未发布对应的容器镜像；`docker manifest inspect` 返回 `no such manifest`。MinIO 社区仓库现已归档，并在文档中声明社区分发仅提供源码，因此锁定旧镜像会错过安全版本，而从源码构建 MinIO 又会为本基础阶段引入额外的容器供应链。

本地栈仍然需要维护良好、预构建、兼容 S3 的服务，并具备确定性的开发凭据、持久的测试数据、健康检查以及 Windows Docker Desktop 支持。

## 决策

阶段 1 的开发与测试栈使用官方多架构镜像 `dxflrs/garage:v2.3.0`。

- 以单节点、单一默认桶方式运行 Garage；这明确是开发/测试拓扑，而非生产持久化设计。
- 将 Garage 的元数据与对象数据都持久化到命名卷中。
- 保持应用侧契约兼容 S3，使用 Garage 的 S3 API 端口 `3900`。
- RPC、admin 与默认桶凭据放在 `.env` 中；Garage 文档化的环境变量覆盖可提供 RPC 与 admin 密钥，无需写入 `garage.toml`。
- ClamAV 单独锁定官方 `clamav/clamav:1.4.5-debian` 镜像，而不是可变的 `1.4_base` 行标签。

## 影响

- 开发者不再依赖未发布或历史遗留的 MinIO 镜像。
- 本地对象存储没有 MinIO Console；Garage 的 admin API 与 CLI 取代了这一运维界面。
- Garage 并未实现所有 Amazon S3 扩展；阶段 1 的集成必须保持在 Garage 文档化兼容集内，并测试其实际使用的操作。
- 单节点布局没有冗余，不得将其描述为生产部署。
- 未来的生产存储决策保持独立，可选择托管 S3 服务或其他兼容实现，而不改变应用契约。

## 被否决的备选方案

- **从 2025-10-15 源码标签构建 MinIO**：保留 MinIO 语义，但在上游转向纯源码分发后，本仓库需要维护缓慢且对安全敏感的镜像构建。
- **锁定最后一个历史 MinIO 容器**：更简单，但早于所引用的安全版本且已不再维护。
- **使用 `latest`**：违反可复现性以及阶段 1 计划中明确的镜像锁定要求。
- **使用 SeaweedFS 或 Ceph**：两者都能暴露 S3 API，但引入的运维面远超单节点开发栈所需。

## 来源

- [MinIO 发布与纯源码容器说明](https://github.com/minio/minio/releases)
- [MinIO 社区仓库纯源码声明](https://github.com/minio/minio)
- [Garage v2.3 快速入门与官方容器](https://garagehq.deuxfleurs.fr/documentation/)
- [Garage 配置与密钥环境变量覆盖](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/)
- [Garage 官方镜像标签](https://hub.docker.com/r/dxflrs/garage/tags)
- [ClamAV 官方镜像标签](https://hub.docker.com/r/clamav/clamav/tags)
