# AGENTS.md

本文件为在本仓库中工作的 AI 智能体（Agent）提供工作规则。

## 语言规则（强制）

- 本项目的默认语言为简体中文：用户可见文案、Markdown 文档、代码注释、提交说明等一律使用简体中文书写。
- 以下内容保持英文原样，不得翻译：标识符、变量名、函数名、类型名、路由、事件类型、数据库表/列/约束、配置键与值、环境变量名、命令、URL、占位符（如 `{aggregateId}`）以及技术专名（如 NestJS、React、Kysely、PostgreSQL、Docker Compose、GitHub Actions、Outbox）。
- 修改代码时只允许改动语言/文案/注释本身，不得改动任何逻辑或业务代码。

<!-- CODEGRAPH_START -->

## CodeGraph

在由 CodeGraph 索引的仓库中（仓库根目录存在 `.codegraph/` 目录），当需要理解或定位代码时，应优先使用 CodeGraph，而不是 grep/find 或直接读文件：

- **MCP 工具**（可用时）：`codegraph_explore` 一次调用即可回答大多数代码问题——相关符号的逐字源码以及它们之间的调用路径，包括 grep 无法追踪的动态分发跳转。在查询中指定文件或符号名即可读取其带行号的当前源码。如果符号被列出但延迟加载，请通过工具搜索按名称加载。
- **Shell**（始终可用）：`codegraph explore "<符号名或问题>"` 输出相同结果。

如果仓库中没有 `.codegraph/` 目录，则完全跳过 CodeGraph——是否建立索引由用户决定。

<!-- CODEGRAPH_END -->
