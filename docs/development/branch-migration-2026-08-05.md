# 分支迁移与 GitHub 治理记录

## 本地基线

治理工作从 `fix/nest-dynamic-config-error` 分支的 `cc38a494bc99b8717619c80618b53650c7b310ba` 提交开始，其父提交是阶段 7 的顶端。分支历史从 `development` 经阶段 2、阶段 4、阶段 5、阶段 6、阶段 7 直至当前修复均为线性。由此产生的治理提交是单次 `development` 引导的候选顶端。

## 归档映射

删除已完成的阶段分支前，请在这些顶端创建不可变标签：

| Branch | Tip | Archive tag |
| --- | --- | --- |
| `codex/phase-01-continuation` | `9fc43a0` | `archive/codex-phase-01` |
| `feature/phase-02-identity-organization-authorization` | `d3b99e9` | `archive/phase-02` |
| `feature/phase-04-market-search-interaction` | `f60def6` | `archive/phase-04` |
| `feature/phase-05-ai-demand-innovation` | `4a6e9e4` | `archive/phase-05` |
| `feature/phase-06-analytics-dashboard-export-assistant` | `e8255b3` | `archive/phase-06` |
| `feature/phase-07-production-security-deployment-operations` | `c31b1f5` | `archive/phase-07` |
| `fix/nest-dynamic-config-error` | governance candidate tip | `archive/pre-development-bootstrap` |

不要强推更新已有引用。如果引导前远程已存在 `development`，请停止并与仓库所有者协调。如果远程仍不存在，则在已验证的治理候选顶端创建一次，然后在恢复常规功能工作前启用分支保护。

## 必需的 GitHub 设置

对 `main` 与 `development` 应用相同规则：

- 必须使用拉取请求。
- 至少一位非作者的批准评审。
- 必需检查：`verify`、`container-smoke`。
- 合并前分支必须保持最新。
- 所有评审对话均已解决。
- 只允许 squash 合并。
- 阻止直接推送、强推与删除分支。
- 紧急绕过仅限于有记录的管理员热修复。

截至本记录，已连接的 GitHub 集成为只读，未返回任何 PR。远程标签、分支创建/删除、PR 创建与分支保护仍待仓库所有者/维护者授权。
