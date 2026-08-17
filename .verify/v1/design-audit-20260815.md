# AI Hub Platform V1 设计图逐图运行时审计

日期：2026-08-15  
捕获工具：Codex Desktop In-app Browser  
当前浏览器视口：`1280×720`，`devicePixelRatio=1.5`。这组截图用于验证运行时页面和交互，不替代设计图要求的 `1672×941` / `2730×1536` 像素级比对。

## 逐图证据

|   # | 设计图            | 运行时证据                            | 状态           | 备注                                                                          |
| --: | ----------------- | ------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
|   1 | 登录页面          | `design/login.png`                    | DONE（运行时） | 登录表单、错误入口和 SSO 入口存在；键盘/移动视口待补。                        |
|   2 | 应用市场          | `design/marketplace.png`              | DONE（运行时） | 搜索、筛选、Tab、分页与真实目录数据可见。                                     |
|   3 | 应用详情          | `design/app-detail.png`               | DONE（运行时） | 发布应用详情、交付入口、互动区可见。                                          |
|   4 | 应用管理          | `design/applications.png`             | DONE（运行时） | 真实 KPI、列表、状态和操作可见。                                              |
|   5 | 应用管理-应用详情 | `design/application-detail.png`       | DONE（运行时） | 应用 workspace 页面可见。                                                     |
|   6 | 应用管理-版本管理 | `design/application-versions.png`     | DONE（运行时） | 版本 `1.0.1`、artifact 通过状态可见。                                         |
|   7 | 审核工作台        | `design/application-review.png`       | DONE（运行时） | 任务详情、审核信息可见；非本人认领/通过已在流程 A 完成。                      |
|   8 | 应用管理-交付配置 | `design/application-delivery.png`     | DONE（运行时） | 四渠道配置和 4/4 启用状态可见。                                               |
|   9 | 创新广场          | `design/innovation.png`               | DONE（运行时） | 需求列表、筛选和排序可见。                                                    |
|  10 | 创新广场-详情     | `design/innovation-detail.png`        | DONE（运行时） | 需求详情页和评论入口可见。                                                    |
|  11 | 数据看板          | `design/analytics.png`                | DONE（运行时） | 日期范围、指标卡和图表容器可见；完整 read model 仍 UNDO。                     |
|  12 | 组织管理          | `design/organization.png`             | DONE（运行时） | 用户管理 Tab、真实员工/部门数据可见。                                         |
|  13 | 组织管理-部门管理 | `design/organization-departments.png` | DONE（运行时） | 部门树、筛选和 KPI 可见。                                                     |
|  14 | 组织管理-角色管理 | `design/organization-roles.png`       | DONE（运行时） | 角色列表和真实角色 API 数据可见。                                             |
|  15 | 组织管理-同步状态 | `design/organization-sync.png`        | DONE（运行时） | 同步运行、配置和健康态可见。                                                  |
|  16 | 组织管理-用户详情 | `design/organization-user-detail.png` | 疑点           | 截图证明用户列表可用，但当前“编辑”按钮没有打开详情 Modal；不能标为交互 DONE。 |
|  17 | 系统安全          | `design/security.png`                 | DONE（运行时） | 审计列表、筛选和导出入口可见。                                                |
|  18 | 站内通知          | `design/notifications-super.png`      | DONE（运行时） | 列表、未读 Tab、全部已读入口可见。                                            |
|  19 | 站内通知详情      | `design/notifications-detail.png`     | DONE（运行时） | 结构化 payload 的标题、正文、审核信息和操作按钮可见。                         |
|  20 | 创作者中心        | `design/creator.png`                  | DONE（运行时） | 应用状态、趋势和撤回入口可见。                                                |
|  21 | AI 助手           | `design/assistant.png`                | DONE（运行时） | 真实助手请求入口和失败反馈状态可见。                                          |

## 审计结论

- 21/21 屏均有本次运行捕获的非空截图；20/21 屏达到“运行时页面可达并可检查”的 DONE，用户详情 Modal 为明确疑点。
- 流程 A 截图证明创建、上传、扫描、版本、四渠道、提交审核、非本人审核、发布和市场详情链路；流程 B 截图证明 resolve/download 入口、点赞幂等、整数评分、评论和反馈提交。
- 截图不能证明 WCAG 对比度、完整键盘焦点顺序、真实移动端回流、原图与实现的 2px/1px 差异；这些保留为 TODO，不以截图数量冒充像素级验收。
- 浏览器插件自身的 Statsig 请求超时不属于本地应用请求；本地 API/worker 请求在流程截图对应时段无未解释的应用错误。

## 后续验收命令

```text
pnpm verify
docker compose ps
docker compose logs --tail=100 api worker garage clamav
```
