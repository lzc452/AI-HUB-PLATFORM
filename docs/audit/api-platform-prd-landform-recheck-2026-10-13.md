# 落地形态复审记录：流式契约（8.2）与配额 SQL（9.4）

| 项 | 内容 |
| --- | --- |
| 复审对象 | `docs/requirements/api-platform-key-management.md` v1.1 第 8.2 节流式契约、第 9.4 节配额口径 |
| 复审日期 | 2026-10-13 |
| 复审目的 | 进入 M2/M3 前的落地可行性验证：拿真实代码与部署配置核对设计能否照此实现 |
| 方法 | 逐条比对设计描述与仓库实现（含 HTTP 管道、守卫、过滤器、body parser、nginx、指标中间件） |
| 结果 | R3 流式契约落地 7 条（P0 4 条）、R4 配额 SQL 落地 5 条；全部采纳并回写 PRD v1.2 |
| 验证边界 | 复审当天（2026-10-13 上午）本机 Docker 未运行（`docker ps` 报 Hyper-V socket 超时），SQL 的 live `EXPLAIN` 与边界值实测当时未执行。**环境恢复后已当日补做**：配额 SQL 与 SSE/nginx 均取得实证，结果见 `docs/audit/api-platform-landform-verification-2026-10-13.md`（其中 R3-02 定性被部分更正、R4-01/R4-02 已验证通过） |

## 一、R3 流式契约落地复审（7 条）

| 编号 | 等级 | 复审发现（含代码证据） | 决策 | 修订落点 |
| --- | --- | --- | --- | --- |
| R3-01 | **P0** | **生产安全中间件会让 /v1 完全不可用**。`system/security/production.middleware.ts:44-67` 对所有 `POST/PUT/PATCH/DELETE`（无路径过滤）先执行 `assertCsrfRequest`，再强制要求 `x-request-nonce` 与 `x-request-timestamp`；`csrf.ts:32-47` 要求 `Origin` 与 `PUBLIC_ORIGIN` **全等**且 cookie/header 双 token 一致。服务端 OpenAI SDK 不带 Origin 也不带 Cookie → 403 `CSRF_ORIGIN_REQUIRED`；即使伪造 Origin 也必然 409 `REPLAY_HEADERS_REQUIRED`。开发环境该中间件 `enabled=false`，故本地测试不会暴露此问题 | 采纳 | 新增 `/v1/*` 显式豁免（含安全依据与评审要求）；PRD 8.3 |
| R3-02 | **P0** | `/v1/` 无独立 location（请求会落到 `location /` 的 web 上游），且 `proxy_read_timeout` 采用默认 60s——`infra/docker/nginx.conf:14-20` 与 `nginx.production.conf:36-44` 均无相关指令。**2026-10-13 实证**：上游空闲 70s 时连接在 **+60.07s 被切断**（改为 300s 后存活 70s），LLM 首 token 等待超 60s 即断流。**原「`proxy_buffering on` 会把 SSE 整段缓冲」的表述已证伪**（三组实测均分块到达，响应头仅延迟到首个数据块），`proxy_buffering off` 降级为建议项；`X-Accel-Buffering: no` 为等效第二路径 | 采纳（**定性已修正**） | PRD 8.3 补丁保留；阻断理由改为「路由缺失 + `proxy_read_timeout`」，去缓冲降为建议 |
| R3-03 | **P0** | **全局 ValidationPipe 会静默改写 OpenAI 请求体**。`apps/api/src/main.ts:112-118` 启用 `whitelist: true`（注释明确「未声明校验装饰器的字段会被剔除」）。网关若为 `/v1` 声明校验 DTO，`tools`/`response_format`/未来新增参数会被剔除 → 兼容性静默破坏 | 采纳 | PRD 8.3：网关不定型 DTO，原样透传；补「未知字段不被改写」用例 |
| R3-04 | **P0** | **全局异常过滤器会破坏 OpenAI 错误信封，且流式二次写响应会崩**。`ProblemDetailsFilter` 以 `APP_FILTER` 挂在 `observability.module.ts:38-40`（全局 `@Catch()`），会把网关抛出的 `HttpException` 渲染为 problem+json；且它在 `catch()` 中无条件 `res.status().type().send()`，若流式已发头会触发 headers already sent | 采纳 | PRD 8.3：新增控制器级 `LlmGatewayExceptionFilter`（Nest 就近优先），并以 `res.headersSent` 分流（已发头 → SSE error 事件） |
| R3-05 | P1 | **body 上限与 413 信封**。`apps/api/src/body-parser.ts:4` 全局 JSON 上限 `1mb`；长上下文请求易超；且中间件层抛出的超限错误不经全局 `@Catch()` 过滤器，不会产出 OpenAI 信封（落到 Express 默认错误响应） | 采纳 | PRD 8.3：仿 `isRawUploadContentRequest` carve-out 为 `/v1/*` 单独注册更大上限 parser，并显式映射 413 |
| R3-06 | P1 | **HTTP 时长指标不能用于衡量网关开销**。`request-context.middleware.ts:63-83` 在 `finish`/`close` 记录时长，流式请求该值包含整个生成时间。另确认 `route-normalizer` 对静态 `/v1/*` 路径标签有界，无基数爆炸风险 | 采纳 | PRD 8.3 + 11.1：新增 `ai_hub_llm_gateway_duration_seconds{phase=ttfb\|total}` |
| R3-07 | P2 | **守卫前置约束**。`permission.guard.ts:39-45`：无鉴权元数据 → 403 `AUTHORIZATION_METADATA_REQUIRED`；`public: true` → 直接放行且**不设置 `request.actor`**。网关控制器必须类级 `@Public()`，且不得读取 actor（Key 上下文自建） | 采纳 | PRD 8.3：明确写法与「漏标元数据 → 403」的断言用例 |

## 二、R4 配额 SQL 落地复审（5 条）

| 编号 | 等级 | 复审发现 | 决策 | 修订落点 |
| --- | --- | --- | --- | --- |
| R4-01 | P1 | 时区表达式 `date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'` 语义正确（先转本地墙钟、截断到当日零点、再转回 timestamptz）；但正确性依赖编写一致性，散落在多处即会漂移。Asia/Shanghai 无夏令时，DST 风险低 | 采纳 | PRD 9.4：表达式封装为仓储层单一常量；集成测试断言「业务日切换点 = UTC 16:00」 |
| R4-02 | P1 | `(employee_id, requested_at)` 复合索引对该谓词形状可用，但**未实测**（Docker 不可用，无法跑 `EXPLAIN`）。若被优化器选择顺序扫，日配额会随日志增长线性劣化 | 采纳 | PRD 9.4：把「必须命中 Index Scan」写成集成测试断言（环境恢复后执行） |
| R4-03 | P1 | 进程内「当日已放行修正」未定义生命周期：跨业务日必须重置，且多实例下各实例独立（A4 单实例假设下可接受）。若按进程启动时间重置会产生跨日残留 | 采纳 | PRD 9.4：明确按 Asia/Shanghai 业务日为 key 缓存，当日切换即清零；多实例演进时移除该机制 |
| R4-04 | P2 | 预检发生在调用前、tokens 在执行后才知，并发窗口内必然可能超额；需明确「不做预留、超额后下一次请求即被拒」的自愈语义，否则实现者可能引入预留导致复杂度与死锁风险 | 采纳 | PRD 9.4：写明预检语义（只比已用，不预留）+ 用例 |
| R4-05 | P2 | 看板（`llm_usage_daily`，聚合延迟 ≤5 分钟）与鉴权口径（日志表实时）存在短时不一致，用户可能误以为看板数字就是实时配额余量 | 采纳 | PRD 9.4 + 7.4：页面标注「看板延迟上界 5 分钟」口径 |

## 三、结论与对里程碑的影响

- R3-01/R3-02/R3-03/R3-04 四条 P0 属**「本地能跑、上生产即挂或静默出错」类型**：若不在 M2 之前固定，必然在联调/上线阶段以「流式不生效」「SDK 报 403/409」「参数被吞」等形式爆出，且排查成本远高于现在写清。
- 落地清单已精确到文件与指令级（nginx 两份配置补丁、中间件豁免、控制器级过滤器、body parser carve-out），M1/M2 可直接据此实现。
- **当日补做的实证结论**（详见 `api-platform-landform-verification-2026-10-13.md`）：
  - R4-01 / R4-02 **已验证通过**：业务日边界四项断言正确（切换点 = UTC 16:00）；参数化查询走 Bitmap Index Scan（2.19ms），无索引退化约 19 倍（41.78ms），结果对账一致；
  - R3-02 **定性更正**：`proxy_read_timeout` 60s 断流已复现（+60.07s 切断，300s 后存活）→ 升级为已验证 P0；「`proxy_buffering` 整段缓冲」证伪 → 降为建议项；
  - R2-02 **表述更正**：错误口径的重置时刻为北京时间 **08:00**（原写「晚上 8 点」有误）；
  - 同时修正了我在验证过程中的 3 处测试缺陷（合成数据相关性、测试桩自带 `X-Accel-Buffering`、`tee | head` 截断证据），留痕见验证报告第三节。

> 说明：本记录为设计阶段复审留痕，不替代代码评审与测试；实现状态以实际代码与运行证据为准。
