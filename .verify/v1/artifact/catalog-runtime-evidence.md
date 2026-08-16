# Catalog PostgreSQL 性能与五角色受众隔离证据

执行时间：2026-08-16（Asia/Shanghai）

## Fixture 规模

- 注入库新增 303 个应用：300 个 `published`（含版本与 metadata）+ draft/withdrawn/archived
  标记各 1 个；版本 302、受众 303、tag links 450、labels 200、deliveries 450、
  attachments 300、likes 900、ratings 150（见 `catalog-fixture-result.txt`）。
- 受众分布：1–220 `all`、221–250 `department:demo-rnd`、251–280 `employee:DEMO-APP-ADMIN`、
  281–300 `department:demo-innovation`。

## 查询计划（`catalog-explain.txt`，EXPLAIN ANALYZE BUFFERS）

- 分页查询使用 `applications_catalog_status_idx`（status + current_version not null）
  位图扫描，audience 以 `application_audiences_department_idx` 半连接过滤
  （audience-before-pagination：过滤在 limit/offset 之前），主排序并列时以
  `application_id` 收尾（本次新增 tiebreaker），top-N heapsort，执行 1.03ms。
- count 与分页同过滤路径，执行 0.77ms；tags 批量为单条 `IN (100 ids)` hash semi join
  0.16ms。like/rating 是页内 20/100 行的索引子计划，不随全表行数放大。

## 查询次数（`catalog-query-log.txt`，log_statement=all 窗口）

单次 `GET /internal/catalog?sort=recommended&page=1&pageSize=100` 共产生 6 条目录 SQL：

1. count 子查询（`visible_catalog`）
2. 分页主查询（limit/offset）
3. `application_tag_links` 单条 `IN` 批量
4. `application_catalog_labels` 单条 `IN` 批量
5. `application_assets` 单条 `IN` 批量
6. `application_deliveries` 单条 `IN` 批量

tags、labels、attachments、deliveries 均为一页一条批量查询，不存在逐行 N+1。
登录/actor 上下文另有常量数量的身份查询（会话、员工、部门、角色、审计）。

## 分页稳定性

`DEMO-EMPLOYEE` 按 recommended 遍历全部页面：total=250，collected=250，unique=250，
无重复、无遗漏（跨页稳定）。

## 五角色列表可见总数

| 角色                               | 可见总数 | 期望（all + 自属）     |
| ---------------------------------- | -------- | ---------------------- |
| DEMO-EMPLOYEE（demo-rnd）          | 250      | 220 + 30 rnd           |
| DEMO-APP-ADMIN（demo-rnd）         | 280      | 220 + 30 rnd + 30 本人 |
| DEMO-INNOVATION（demo-innovation） | 240      | 220 + 20 innovation    |
| DEMO-ORG-ADMIN（demo-admin）       | 220      | 220 + 0                |
| DEMO-SUPER-ADMIN（demo-admin）     | 220      | 220 + 0                |

## direct-ID 详情矩阵（200 可见 / 404 隔离）

| 标记                     | 普通员工 | 应用管理员 | 创新运营 | 组织管理员 | 超级管理员 |
| ------------------------ | -------- | ---------- | -------- | ---------- | ---------- |
| draft                    | 404      | 404        | 404      | 404        | 404        |
| withdrawn                | 404      | 404        | 404      | 404        | 404        |
| archived                 | 404      | 404        | 404      | 404        | 404        |
| audience demo-rnd        | 200      | 200        | 404      | 404        | 404        |
| audience DEMO-APP-ADMIN  | 404      | 200        | 404      | 404        | 404        |
| audience demo-innovation | 404      | 404        | 200      | 404        | 404        |

未发布、撤回、归档和非受众资源对全部角色均返回
`404 CATALOG_APPLICATION_NOT_FOUND`，不泄露存在性。
