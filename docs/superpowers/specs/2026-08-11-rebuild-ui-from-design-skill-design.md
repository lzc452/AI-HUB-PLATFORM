# `rebuild-ui-from-design` 项目技能设计

## 背景与目标

`packages/ui/src` 保存 AI Hub Platform 的页面设计图，当前共有 21 张 PNG，多数为 1672×941，另有 2730×1536。前端实现位于 `apps/web`，采用 React 19、React Router、Ant Design 6、TailwindCSS 4、TanStack Query 和 Vitest；`packages/ui/src/theme.ts` 通过 `ConfigProvider` 提供全局主题。

本设计创建项目级模型自动调用技能 `.codex/skills/rebuild-ui-from-design`。技能指导 Agent 将指定设计图高保真还原为现有前端代码，同时保留路由、权限、数据访问、状态管理和测试架构。默认一次处理一张设计图或一组关联页面；只有用户明确要求时才批量处理全部设计图。

## 核心原则

采用“双真相源”：

- 设计图是布局、视觉、尺寸、颜色和图标的唯一真相源。
- 现有代码是路由、交互、权限、数据和业务行为的唯一真相源。

视觉还原不得演变为业务重构；现有实现不得覆盖设计图中的可测量视觉事实。两者冲突时暂停当前页面并请求用户决策。

## 技能结构

```text
.codex/skills/rebuild-ui-from-design/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    ├── project-architecture.md
    ├── design-measurement.md
    ├── component-and-icon-rules.md
    └── visual-verification.md
```

- `SKILL.md`：只包含强制执行顺序、分支入口和完成门禁。
- `project-architecture.md`：说明如何使用 CodeGraph 检查路由、调用链、共享组件、数据 hooks、主题和测试影响范围；项目配置仍以仓库文件为准，避免复制易过期信息。
- `design-measurement.md`：定义原始分辨率检查、区域拆分和测量清单。
- `component-and-icon-rules.md`：定义组件边界、共享组件、Ant Design、TailwindCSS、主题覆盖和 SVG 规则。
- `visual-verification.md`：定义截图、叠加对比、误差矩阵和验收门槛。
- `agents/openai.yaml`：提供技能名称、简短说明和显式包含 `$rebuild-ui-from-design` 的默认提示词。

不创建 `README.md`、额外安装文档或 `assets/`。设计图继续以 `packages/ui/src` 为唯一来源。

## 执行流程

1. **锁定目标**：确定设计图、关联页面、目标路由和原始视口。文件名不能唯一映射路由时请求用户确认。
2. **建立视觉规格**：在原始分辨率查看设计图，记录页面区域、坐标、宽高、间距、字体、颜色、圆角、边框、阴影和图标。形成可检查的测量清单。
3. **检查现有架构**：仓库存在 `.codegraph/` 时优先使用 CodeGraph，读取目标页面调用链、`components/common`、页面专属组件、`modules`、路由、权限、主题和测试。形成影响清单。
4. **建立红色基线**：在与设计图一致的视口捕获当前实现；对行为或组件接口的变更，先添加能因缺少目标行为而失败的测试。
5. **分层实现**：按页面骨架、布局区域、可复用组件、Ant Design 状态、图标和像素细节的顺序实现。每完成一个区域就对照测量清单。
6. **视觉收敛**：在原始视口截图，对设计图进行叠加或差异检查，逐项修正偏差矩阵。
7. **工程验证**：运行目标测试、`typecheck`、`lint` 和 `build`。修改全局主题或样式时，验证全部受影响路由。
8. **单图完成**：当前设计图通过全部门禁后才进入下一张。最终报告设计图、路由、视口、关键测量、验证命令和仅剩的渲染噪声。

## 组件与架构规则

- `pages` 负责编排页面；`modules` 保留 API、hooks 和业务状态；业务路由、权限和数据模型保持不变。
- 实施前盘点 `apps/web/src/components/common`，优先扩展已有组件。
- 任何跨页面复用需求都必须抽取为 `apps/web/src/components/common` 公共组件。
- 相同视觉与交互模式出现在两个及以上页面时，使用同一公共实现，通过明确 props 表达内容、尺寸、状态和图标变体。
- 公共组件不获取页面业务数据；数据由页面或 `modules` 注入。
- 公共组件独立导出，并测试主要变体与交互。
- 只有页面专属且没有复用价值的组件才与页面就近放置。
- 保留现有可访问性语义、键盘操作、焦点样式和移动端断点；桌面设计图按原始视口 1:1 还原。

## 样式优先级

按以下顺序选择实现方式：

1. 复用现有公共组件。
2. 使用 Ant Design 组件与 props。
3. 使用 TailwindCSS 表达页面布局、尺寸和局部视觉。
4. 多处同类 Ant Design 组件需要相同效果时，修改 `packages/ui/src/theme.ts` 的 global token 或 component token。
5. token 无法覆盖时，在全局样式中添加带业务作用域的选择器。

修改全局主题或样式前，必须列出所有受影响组件与路由。修改后必须逐页验证全部相似组件，不能只验证当前页面。

## 图标规则

- 先按轮廓、填充方式和视觉比例检查 `@ant-design/icons`。
- 简单图标使用最接近的 Ant Design Icon，并精确设置颜色、尺寸和对齐。
- 没有合适图标时创建独立 React SVG 组件，精确设置 `viewBox`、路径、描边、填充、线帽、线连接和可访问性属性。
- 复杂 SVG 作为组件复用，不以字符、emoji、外部 icon font 或近似图片替代。

## 视觉验收

每轮对比记录：

```text
区域 | 设计值 | 实际值 | 偏差 | 状态
```

完成门槛：

- 在设计图原始分辨率和对应浏览器视口截图。
- 核心布局、边距和尺寸误差不超过 2px。
- 图标尺寸与对齐误差不超过 1px。
- 设计图取样颜色与实现颜色一致。
- 页面结构、文本层级、边框、圆角、阴影和图标视觉一致。
- 字体抗锯齿等平台渲染噪声由人工复核，可接受项必须在最终报告中明确记录。
- 不存在未说明的关键视觉偏差。

## 状态与回归验证

- 保留并验证加载、空数据、错误、无权限、悬停、聚焦、选中和禁用状态。
- 设计图未展示的状态遵循现有 Ant Design 和项目交互规范。
- 对公共组件补充主要 props 变体、语义和交互测试。
- 优先运行目标测试，再运行 `pnpm --filter @ai-hub/web test`、`typecheck`、`lint` 和 `build`。
- 修改 `packages/ui` 时，额外运行该包的 `test`、`typecheck`、`lint` 和 `build`。
- 全局主题或样式变化需要为全部影响页面留存截图验证结论。

## 决策门禁

遇到下列情况时暂停当前页面并请求用户决策：

- 设计图资源缺失或无法可靠读取。
- 文件名不能唯一映射现有路由。
- 设计图要求与现有业务行为、权限或数据契约冲突。
- 响应式行为无法从现有实现和关联设计图可靠推断。
- 全局样式修改会影响未提供验收依据的重要页面。

## 验收标准

- 技能可以由“根据 `packages/ui/src` 设计图还原页面”“像素级实现某张 PNG”“对齐设计稿”等请求自动触发。
- 主文件保持短而顺序清晰，分支细节通过 `references/` 按需读取。
- 一次调用默认只完成一张图或一组关联页面。
- 生成实现遵循既有 React、React Router、Ant Design、TailwindCSS、TanStack Query 和 Vitest 架构。
- 跨页面复用模式统一进入 `apps/web/src/components/common`。
- 简单图标使用 `@ant-design/icons`，复杂图标使用 1:1 React SVG 组件。
- 当前页面通过视觉、状态、架构和工程四类门禁后才被声明完成。
