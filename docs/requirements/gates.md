# 当前实施门禁与执行证据

> 开始：2026-10-08。用户已授权本次目标所需的业务代码及测试修改。需求以[统一基线](README.md)为准；案例以[统一验收手册](acceptance.md)为准。本文件只维护同一目标的实施状态，不另立需求或排期。

## 1. 推进顺序与退出条件

| 顺序 | 门禁                          | 退出证据                                                                                                            | 当前状态                                           |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1    | P0 业务、权限、文件边界       | GAP-01/02/03/04/06/08 各自的拒绝与成功回归；关键路径取得真实 PostgreSQL/HTTP 证据                                   | 进行中，六项中两项定向门禁通过；通知入口仅 L1 通过 |
| 2    | 真实数据库双业务链与通知取证  | 应用交付/审核/目录与需求认领/试点/应用转化贯通；21 通知场景记录真实收件人、业务 ID、通知 ID、Outbox、幂等及失败结果 | 待 P0 门禁通过                                     |
| 3    | P1 一致性与集成               | GAP-05/07/09 的跨入口/并发/事务回归；按启用范围完成真实钉钉、Dify 成功/失败/重试                                    | 待前序门禁通过                                     |
| 4    | Portal/Console 联调与业务 UAT | 两仓工程检查、同域双端浏览器链、当前两种分发角色与受众隔离；业务验收记录                                            | 未执行                                             |
| 5    | 真实生产部署、恢复与签核      | 对已确认的生产环境执行发布、健康/权限/业务烟测、备份恢复与双机演练，并取得业务及运维签核                            | 未执行，尚未确认生产目标与外部集成配置             |

各阶段按证据退出；本地代码、单测和历史报告都不能替代后续阶段。未新增日历排期。

## 2. P0 分项状态

| 缺口               | 本次实现与证据                                                                                                                                                                                                                                                                                           | 状态及剩余工作                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| GAP-01 生产私钥    | [加密服务](../../packages/server/src/identity/login-encryption.service.ts)从 PEM 派生公钥，私钥仍以不可导出方式导入；[回归](../../packages/server/src/identity/login-encryption.service.test.ts)先复现 InvalidAccessError 再通过；真实 IdentityModule 配置 PEM、挑战、加密登录、Cookie 与受保护 API 通过 | 定向门禁通过；完整部署启动与生产证据仍在后续阶段                                  |
| GAP-02 通知        | [完整草稿提交](../../packages/server/src/application/application.service.ts)复用旧制品入口的事务外广播；[确认认领](../../packages/server/src/demand/demand.service.ts)事务提交后通知提交人；新增三项回归先失败再通过                                                                                     | 进行中；旧角色授权/广播尚未统一为当前权限，实际通知落库及 21 场景尚未取得本次证据 |
| GAP-03 角色停用    | [身份仓储](../../packages/server/src/identity/identity.repository.ts)运行授权只读取 active 角色；管理读取保留原分配；广播排除停用角色/员工；[真实 HTTP 回归](../../apps/api/test/identity-role-status.real.e2e-spec.ts)证明原 Cookie 会话停用后 403、恢复后 200                                          | 定向门禁通过；完整菜单/浏览器验收仍属 AC-02                                       |
| GAP-04 制品向导    | 当前完整草稿仍创建 artifactKey=null 的版本，桌面/移动审核要求制品                                                                                                                                                                                                                                        | 待修复；必须贯通真实安装包→验证→版本→审核→目录下载，不放宽审核校验代替衔接        |
| GAP-06 需求附件    | 当前仍直接格式/魔数/摘要检查后入库                                                                                                                                                                                                                                                                       | 待修复；取得真实安全扫描成功与拒绝证据                                            |
| GAP-08 Portal 受众 | 当前 published app 公开查询未复用 Catalog 受众过滤                                                                                                                                                                                                                                                       | 待修复；公开/跨部门/指定员工/匿名及资产读取分别验证                               |

## 3. 已执行检查（2026-10-08）

使用仓库常规 Vitest 配置，无临时垫片、忽略异常参数或模拟数据库。TEST_DATABASE_URL 未设置，真实回归由仓库测试容器工具创建独立 PostgreSQL，测试结束停止容器，没有运行生产迁移或 seed。

| 检查                                        | 结果         | 证据范围                                                                                             |
| ------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| 加密登录、身份、Cookie、通知矩阵服务 4 文件 | 49/49 通过   | L1；含 PEM 往返、公开 JWK 无私钥参数；通知矩阵服务测试不是生产装配授权证明                           |
| 应用/需求服务 2 文件                        | 146/146 通过 | L1；新增完整草稿通知、方案确认通知及失败不回滚；实际收件人与落库仍待 L2                              |
| identity-role-status.real.e2e-spec.ts       | 3/3 通过     | L2；真实 PostgreSQL、配置 PEM、加密协议、真实 Cookie 会话、停用/恢复角色、分配保留与停用员工广播过滤 |

本次失败→修复→通过摘要及来源文件摘要保存在[执行证据](../../.verify/v1/p0-gates-20261008/results.json)。49 与 146 来自不同文件；不与 2026-10-07 的 200/237/92 批次合算为当前独立总量。

在 `packages/server` 执行：

```powershell
pnpm exec vitest run --pool=threads --reporter=dot src/identity/login-encryption.service.test.ts src/identity/identity.service.test.ts src/identity/session-cookie.spec.ts src/notification/dingtalk-matrix.service.test.ts
pnpm exec vitest run --pool=threads --reporter=dot src/application/application.service.test.ts src/demand/demand.service.test.ts
```

在仓库根目录执行：

```powershell
pnpm exec vitest run --config apps/api/vitest.api-data.config.ts apps/api/test/identity-role-status.real.e2e-spec.ts --pool=threads --reporter=dot
pnpm exec tsc --noEmit --project packages/server/tsconfig.json
pnpm exec tsc --noEmit --project apps/api/tsconfig.json
```

目前未取得：完整 verify、真实双业务链/21 场景通知、Portal 客户端/双端浏览器、真实外部投递、生产部署/恢复及签核。目标继续保留上述五步顺序；下一步完成通知权限授权与广播名单，并取得实际落库证据。
