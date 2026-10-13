# Git 分支与 GitHub 交付

本仓库的所有产品阶段都采用 development 集成模型。

```text
main                 releasable production history
  ^ release PR
development          shared integration branch
  ^ squash merge PR
feature/phase-XX-*   phase-level delivery branch
```

## 分支

- `main` 只包含可发布版本。变更通过 `release/vX.Y` 拉取请求进入。
- `development` 是当前阶段工作的集成分支。变更通过功能拉取请求进入。
- `feature/phase-XX-*` 承载单个阶段，是该阶段唯一的长生命周期功能分支。每个任务是一个独立的 Conventional Commit。
- `release/vX.Y` 从 `development` 创建，用于最终验证、发布说明与版本打标签。
- `hotfix/*` 保留给紧急生产修复。热修复经评审后同时进入 `main` 与 `development`。
- `codex/phase-01-continuation` 保留为历史归档分支，不是开发入口。

长生命周期分支刻意限定为 `main`、`development`、活动阶段分支、`release/*` 与 `hotfix/*`。已完成的阶段分支在删除前会以不可变归档标签与迁移记录保留。

阶段 2 分支为：

```text
feature/phase-02-identity-organization-authorization -> development
```

## 日常工作流

1. 从最新的 `development` 分支开始。
2. 在阶段功能分支上工作。
3. 每个任务保持独立提交，提交前先运行定向测试。
4. 运行 `git diff --check`，每个任务完成后立即推送，并持续更新同一个草稿 PR。
5. 只有完整验证门禁与评审完成后，才将 PR 转为 Ready。
6. 将 PR squash 合并到 `development`；不要改写已推送的历史。

示例任务提交：

```text
feat(identity): add organization schema [P2-T01]
feat(identity): add password sessions and reset flow [P2-T02]
feat(identity): add DingTalk sync port [P2-T03]
feat(authz): add RBAC and audience authorization [P2-T04]
feat(api): protect identity administration endpoints [P2-T05]
test(phase-02): close verification and gate evidence [P2-T06]
```

## 拉取请求契约

每个功能或发布 PR 必须说明其范围、任务 ID、变更模块、定向测试、迁移影响、外部凭据或部署风险、`pnpm verify` 结果、Docker Compose 冒烟结果与回滚流程。请使用仓库 PR 模板，让这些证据随 PR 保留。

阶段 2 PR 在整个任务交付期间保持为一个草稿 PR，只有所有任务提交、推送、评审与验证完成后才转为 Ready。

## 门禁与分支保护

GitHub Actions 的 `verify` 工作流在推送到交付分支以及针对 `main` 或 `development` 的拉取请求上运行。其必需检查为：

- `verify`
- `container-smoke`

仓库管理员必须使用以下设置保护 `main` 与 `development`：

- 要求拉取请求，且至少有一位非作者的批准评审。
- 要求所有评审对话均已解决。
- 要求合并前分支保持最新。
- 要求 `verify` 与 `container-smoke` 检查通过。
- 只允许 squash 合并；禁用合并提交与 rebase 合并。
- 阻止直接推送、强推与删除分支。
- 将绕过限制为管理员执行的、有记录的紧急热修复。

GitLab CI 不是本仓库的权威或必需流水线。

分支保护是 GitHub 仓库设置，而非版本化文件。修改后，请在仓库 Settings 页面验证规则，并在发布或治理 PR 中记录日期与管理员。

```text
development -> release/vX.Y -> full gates -> release PR -> main -> tag vX.Y
```

## 发布与回滚

发布工作流仅使用提交 SHA 标签将 `api`、`worker` 与 `web` 镜像发布到 GHCR。发布清单记录由此产生的不可变摘要与 BuildKit SBOM/供应链证明声明。生产部署是显式、需人工批准的检查点；主机凭据与部署目标保存在仓库之外。

- 未合并的功能通过关闭其 PR 回滚；已推送的历史保留。
- 已合并进 `development` 的变更通过 revert PR 回滚。
- 已发布的生产修复使用 `hotfix/*`，随后分别向 `main` 与 `development` 提交经评审的 PR。
- 绝不要通过 reset 或强推共享分支来回滚变更。

## 2026-08-05 迁移与治理记录

本节合并原独立迁移记录，保留历史基线与归档映射；本次文档整理未核查远端分支、标签和保护设置是否已经执行。

治理工作从 `fix/nest-dynamic-config-error` 的 `cc38a494bc99b8717619c80618b53650c7b310ba` 开始，其父提交为阶段 7 顶端。该记录描述了从 `development` 经阶段 2、4、5、6、7 到修复分支的线性历史，治理候选顶端用于当时的单次 `development` 引导。

当时建议在删除已完成阶段分支前创建以下不可变标签：

| 分支 | 顶端 | 归档标签 |
| --- | --- | --- |
| `codex/phase-01-continuation` | `9fc43a0` | `archive/codex-phase-01` |
| `feature/phase-02-identity-organization-authorization` | `d3b99e9` | `archive/phase-02` |
| `feature/phase-04-market-search-interaction` | `f60def6` | `archive/phase-04` |
| `feature/phase-05-ai-demand-innovation` | `4a6e9e4` | `archive/phase-05` |
| `feature/phase-06-analytics-dashboard-export-assistant` | `e8255b3` | `archive/phase-06` |
| `feature/phase-07-production-security-deployment-operations` | `c31b1f5` | `archive/phase-07` |
| `fix/nest-dynamic-config-error` | 当时的治理候选顶端 | `archive/pre-development-bootstrap` |

引导时不得强推已有引用；若远端已有 `development`，应先与维护者协调。若尚不存在，则在已验证的候选顶端创建一次，并在继续功能开发前启用本指南的分支保护。

原记录中的 GitHub 集成为只读且未返回 PR，远端标签、分支创建或删除、PR 与保护设置当时仍待维护者处理。此项为历史待办，不能据文档合并认定远端治理已完成。
