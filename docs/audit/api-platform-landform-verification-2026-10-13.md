# 落地形态实证验证报告：配额 SQL 与 SSE 穿 nginx

| 项 | 内容 |
| --- | --- |
| 验证对象 | `docs/requirements/api-platform-key-management.md` v1.2 的 9.4 配额 SQL（R4-01/R4-02）与 8.3 nginx 配置（R3-02） |
| 验证日期 | 2026-10-13（Rancher Desktop 环境恢复后补做） |
| 环境 | Docker engine 29.5.3；PostgreSQL 18.4（项目 compose 镜像 `postgres:18.4-bookworm`）；nginx 1.29.4-alpine（项目 compose 镜像）；测试桩运行于 `node:24.15.0-bookworm-slim` |
| 隔离措施 | 配额 SQL 在**独立 scratch 库** `llm_verify_scratch` 执行（不触碰项目 schema，验证后已 drop）；SSE 实验在**独立网络** `llm-verify-net` + 独立容器（`llm-*` 前缀）中进行，验证后全部删除 |
| 结论摘要 | 2 项证实（含 1 项升级为已验证 P0）、1 项**证伪并更正**、1 项自纠错（我此前的表述有误） |

## 一、配额 SQL 实证（R4-01 时区边界 / R4-02 索引命中）→ **已验证通过**

数据规模：45 万行（3 员工 × 5 Key × 30 业务日 × 每日 1000 个时刻），索引 `(employee_id, requested_at)`。

### 1.1 业务日边界断言（4/4 通过）

| 断言 | 输入时刻 | 实测当日零点 | 判定 |
| --- | --- | --- | --- |
| B1 | `2026-10-12 23:59:59+08` | `2026-10-11 16:00:00+00` | ✅ 正确 |
| B2 | `2026-10-13 00:00:00+08` | `2026-10-12 16:00:00+00` | ✅ 正确 |
| B3 | `2026-10-13 00:30:00+08`（跨零点） | `2026-10-12 16:00:00+00` | ✅ 同一业务日 |
| B4 | `2026-10-13 23:59:59+08` | `2026-10-12 16:00:00+00` | ✅ 正确 |

**结论**：`date_trunc('day', <timestamptz> at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'` 语义正确，业务日切换点 = UTC 16:00（与前一日一致），表达式可作为单一常量固化。

### 1.2 错误写法对照（证明修复必要性）

| 断言 | 实测 | 说明 |
| --- | --- | --- |
| B5 错误写法 `date_trunc('day', <timestamptz>)` | `2026-10-12 00:00:00+00`（距该零点 16:30:00） | 比正确边界早 16 小时 |
| **B6 错误写法的重置时刻（北京时间）** | **`2026-10-13 08:00:00`** | **错误实现下配额窗口重置发生在北京时间 08:00，而非零点** |
| B7 两口径窗口大小 | 上海口径 **15000** 行 / UTC 口径 **0** 行 | 错位窗口会漏算当日 00:00–08:00 的用量（实测该窗口内为 0 行） |

> **更正声明**：我在 R2-02 评审意见中写的「配额会在**晚上 8 点**重置」是**错的**，实测为**北京时间 08:00**（UTC 零点 = 东八区 08:00）。R2-02 的结论（必须显式指定业务日时区）不受影响，反而被 B7 强化：错误口径不仅错位 8 小时，还会把当日 00:00–08:00 的消耗整体漏出窗口。

### 1.3 索引命中（参数化，模拟 Kysely 绑定参数）→ 通过

```text
Aggregate (actual time=2.133..2.135 rows=1.00 loops=1)
  Buffers: shared hit=1058
  ->  Bitmap Heap Scan on llm_api_call_logs_verify (actual time=0.337..1.705 rows=5000.00 loops=1)
        Recheck Cond: ((employee_id = '...003'::uuid) AND (requested_at >= '2026-10-12 16:00:00+00'::timestamp with time zone))
        Heap Blocks: exact=1046
        ->  Bitmap Index Scan on llm_verify_employee_requested_idx (actual time=0.235..0.235 rows=5000.00 loops=1)
              Index Searches: 1
Planning Time: 0.176 ms
Execution Time: 2.186 ms
```

**要点**：① 参数化查询（`PREPARE`/`EXECUTE`，与 Kysely 参数绑定同形）经 **Bitmap Index Scan 命中复合索引**；② 参数被解析为字面量 `2026-10-12 16:00:00+00`，证明时区边界是**常量、谓词可 sargable**；③ 执行 2.19ms。

### 1.4 无索引对照 + 结果对账

| 场景 | 计划 | 执行耗时 | 聚合结果 |
| --- | --- | --- | --- |
| 有索引 | Bitmap Index Scan | **2.19 ms** | 1,747,500 tokens |
| 无索引（drop 后） | Parallel Seq Scan（`Rows Removed by Filter: 148333`） | **41.78 ms** | 1,747,500 tokens |

**要点**：无索引退化 **约 19 倍**（41.78ms vs 2.19ms）→ 索引不是可选项；两次结果完全一致 → 索引不改变查询语义（对账通过）。规模参考：表 40 MB / 索引 6.7 MB。

## 二、SSE 穿 nginx 实证（R3-02）→ **部分证实、部分证伪**

### 2.1 缓冲行为三组矩阵（每 1 秒一个事件，共 6 个）

| 组 | nginx 配置 | 上游响应头 | 实测到达节奏 | 结论 |
| --- | --- | --- | --- | --- |
| A | 仓库现状（无任何 SSE 指令） | 无 | 头 +1.05s，块 1.05/2.05/3.05/4.05/5.05/6.06s | **分块到达，未被整段缓冲** |
| B | PRD 补丁（`proxy_buffering off` 等） | 无 | 头 +0.05s，块 1.05…6.05s | 分块到达，头更早 |
| C | 仓库现状 | 自带 `X-Accel-Buffering: no` | 头 +0.06s，块 1.06…6.07s | 分块到达，头更早 |

**A′ 内容类型隔离**（同一现状配置，仅把上游类型改为 `text/plain`）：头仍为 **+1.05s** → 响应头延迟**与 SSE 内容类型无关**，是 `proxy_buffering on` 的通用行为（等首个响应体到达才下发响应头）。

> **更正声明**：我在 R3-02 中写的「nginx 会把 SSE 整段缓冲、流式响应一次性到达」**被证伪**（nginx 1.29.4 对小块 chunked 响应会逐块转发）。可观测差异仅为**响应头延迟到首个数据块**（+1.05s vs +0.05s），对 SSE 用户体感影响很小。

### 2.2 决定性实验：`proxy_read_timeout` 默认 60s × 上游空闲 70s

```text
=== 对照：nginx 现状（proxy_read_timeout 默认 60s）+ 上游空闲 70s ===
[+0.06s] HTTP 200 content-type=text/event-stream
[+0.06s] chunk#1: data: {"seq":1,...}
[+60.07s] 传输中断：UND_ERR_SOCKET / terminated        ← 连接被 nginx 切断

=== 实验：nginx 设 proxy_read_timeout 300s + 上游空闲 70s ===
[+0.05s] HTTP 200 content-type=text/event-stream
[+0.05s] chunk#1: data: {"seq":1,...}
[+70.05s] chunk#2: data: {"seq":2,...,"idle_seconds":70} data: [DONE]
[+70.05s] EOF（共 2 个数据块）                          ← 连接存活
```

**结论**：`proxy_read_timeout` 默认 60s 是**真实、可复现的生产阻断项**——LLM 首 token 等待或思考间隔超过 60s 即断流（用户看到「半截回答」并报错）；补丁中的 `proxy_read_timeout 300s` 有效。**该项升级为已验证 P0**。

### 2.3 修正后的 R3-02 结论

| 项 | 修正后定性 |
| --- | --- |
| `proxy_read_timeout` / `proxy_send_timeout` 放宽 | **必需**（已验证：60s 断流，300s 存活） |
| `/v1/` 独立 location 路由 | **必需**（当前两份配置均无 `/v1/`，请求会落到 `/` 的 web 上游） |
| `proxy_buffering off` / `proxy_cache off` | **建议（非阻断）**：可将响应头提前到首个数据块之前，并防御未来引入的压缩/缓存中间层；原「否则整段缓冲」的理由不成立 |
| 上游 `X-Accel-Buffering: no` | **建议作为纵深防御**：C 组证明它是等效第二路径；主控制点仍在 nginx |

## 三、验证过程中修正的自身错误（留痕）

| 编号 | 错误 | 发现方式 | 处置 |
| --- | --- | --- | --- |
| E-1 | 「配额会在晚上 8 点重置」 | B6 实测为 08:00 | 更正 R2-02 表述；PRD/评审记录同步修正 |
| E-2 | 「nginx 把 SSE 整段缓冲」 | 三组矩阵均分块到达 | 更正 R3-02 定性：`proxy_buffering off` 降级为建议，`proxy_read_timeout` 升为必需 |
| E-3 | 首轮合成数据中「员工」由 `i%3`、「业务日」由 `i%30` 决定，两者完全相关（30 与 3 有公因子 3） | EXPLAIN 显示匹配 0 行 | 改为交叉连接造数（员工与日期解相关），复跑通过 |
| E-4 | 首轮 SSE 测试桩自带 `X-Accel-Buffering: no`，污染了对照组 | 对照组装卸后仍分块到达，反查桩代码 | 参数化该响应头，重做三组矩阵 |
| E-5 | 首轮输出经 `tee \| head` 触发 SIGPIPE，尾部证据被截断 | 证据文件缺尾部计划 | 改为直接重定向到文件后读取 |

## 四、环境还原

| 项 | 状态 |
| --- | --- |
| 测试容器（`llm-sse`、`llm-sse-hdr`、`llm-nginx-default/fixed/hdr`） | 已删除（`docker ps -a` 无 `llm-` 残留） |
| 测试网络 `llm-verify-net` | 已删除 |
| scratch 库 `llm_verify_scratch` | 已 DROP |
| 项目容器 `ai-hub-platform-postgres-1` | 已恢复为停止状态（验证期间临时启动） |
| 项目数据 | 未读写任何项目 schema/表 |

## 五、仍未验证项（不在本次范围）

1. **真实 vLLM 上游的 usage 返回形态**（流式末块是否带 `usage`、`stream_options.include_usage` 的实际支持情况）——需 vLLM 部署后联调，直接决定 R1-08 修复的落地细节；
2. **真实 TTFT 分布**——决定 `proxy_read_timeout` 取值是否需进一步放宽（当前 300s 为设计值）；
3. 浏览器端 SSE 消费（网关面已明确不开放 CORS、禁止浏览器直连，故不在范围）。

> 说明：本报告为设计阶段的实证留痕；证据文件（原始输出）位于 `tmp/llm-verify/`（该目录按仓库规则不入库）。实现阶段的验证以代码与 CI 证据为准。
