# 公共组件、样式与图标

## 复用决策

每个重复模式输出：

```text
ReuseDecision
- pattern
- routes
- existingComponent
- action: extend/create/page-local
- commonPath
- props
- tests
```

若相同视觉与交互模式出现在两个及以上页面，`action` 必须是 `extend` 或 `create`，目标路径必须在 `apps/web/src/components/common`。页面数据由调用方注入，公共组件不获取业务数据。

公共组件应提供明确 props 表达内容、尺寸、图标和状态变体；独立导出；为主要变体和交互补充测试。仅页面专属且无复用价值的组件才与页面就近放置。

## 样式优先级

```text
现有 components/common
→ Ant Design 组件与 props
→ TailwindCSS 局部布局和尺寸
→ packages/ui/src/theme.ts 的 global token/component token
→ 带业务作用域的全局选择器
```

修改全局 token 或 CSS 前，列出全部受影响组件和路由；修改后逐页截图检查。全局规则必须表达重复的真实设计，不为单页临时偏差扩大作用域。

## 图标决策

每个图标输出：

```text
IconDecision
- designRegion
- silhouette
- fillMode
- antdCandidate
- similarityFinding
- implementation: antd/svg
- size/color/alignment
- accessibility
```

- 先检查 `@ant-design/icons` 的轮廓、填充方式和视觉比例；简单图标使用最接近的已有图标。
- 没有合适候选时创建独立 React SVG 组件，精确设置 `viewBox`、path、stroke、fill、linecap、linejoin 和尺寸。
- SVG 组件使用 `aria-hidden="true"`，除非图标承担独立语义；有独立语义时提供可访问名称。
- 不用 emoji、字符、外部 icon font、随意的 Unicode 或近似图片替代复杂图标。
