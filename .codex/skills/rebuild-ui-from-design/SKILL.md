---
name: rebuild-ui-from-design
description: Use when Codex 需要根据 packages/ui/src 中的 PNG 设计图实现或校准 AI Hub Platform 前端，包括像素级布局、Ant Design/TailwindCSS 样式、跨页面公共组件、图标匹配、复杂 SVG 还原或截图差异验证。
---

# 设计图像素级前端还原

## 核心原则

采用“双真相源”：设计图是布局、视觉、尺寸、颜色和图标的真相源；现有代码是路由、交互、权限、数据和业务行为的真相源。默认一次完成一张设计图或一组明确关联页面；只有用户明确要求时才批量处理。

## 必须读取的参考

按目标任务读取，不要跳过：

- [项目架构](references/project-architecture.md)：目标路由、调用链、共享组件、主题和回归范围。
- [设计测量](references/design-measurement.md)：原图尺寸、坐标、区域和视觉测量表。
- [组件与图标](references/component-and-icon-rules.md)：`components/common`、Ant Design、TailwindCSS、token 和 SVG 决策。
- [视觉验证](references/visual-verification.md)：同视口截图、差异矩阵、状态和工程门禁。

## 强制工作流

1. **锁定目标**：确定设计图、关联页面、目标路由和原始视口。文件名无法唯一映射路由时先请求确认。
2. **建立视觉规格**：在原始分辨率查看设计图，完成设计测量表；把测量事实与响应式推断分开。
3. **建立架构影响清单**：仓库存在 `.codegraph/` 时先用 CodeGraph，定位页面入口、调用路径、数据 hooks、权限、现有公共组件、主题文件和受影响路由。
4. **捕获 RED 基线**：在相同浏览器视口捕获当前页面。会改变行为或公共组件接口时，先写一个因目标行为缺失而失败的测试并确认失败原因。
5. **按层实现**：页面骨架 → 布局区域 → `apps/web/src/components/common` 公共组件 → Ant Design 状态 → 图标与 SVG → 像素细节。页面编排留在 `pages`，业务数据和 hooks 留在 `modules`。
6. **视觉收敛**：按参考中的偏差矩阵逐项对照、修正、重新截图；一次只修正一类根因。
7. **工程验证**：先跑目标测试，再跑受影响 package 的 `test`、`typecheck`、`lint` 和 `build`。修改全局 token 或 CSS 时，验证全部受影响路由。
8. **完成单图**：只有视觉、状态、架构和工程四类门禁全部通过，才进入下一张设计图并报告证据。

## 完成契约

最终回复必须列出：设计图与路由、原始视口、架构影响清单、公共组件复用或新增路径、图标决策、视觉偏差矩阵、验证命令及结果、已说明的渲染噪声。不得把“目测接近”“最后再看”当作验收结论。

## 决策门禁

资源缺失、路由不明、设计与业务契约冲突、响应式行为无法可靠推断，或全局样式会影响无法验收的重要页面时，暂停当前页面并请求用户决策。不要自行改写路由、权限、API、数据模型或用近似图标掩盖缺口。

## 快速自检

| 检查 | 完成条件 |
| --- | --- |
| 视觉 | 核心布局/间距误差 ≤2px，图标尺寸/对齐误差 ≤1px，取样颜色一致 |
| 组件 | 跨页面模式统一进入 `apps/web/src/components/common`，公共组件通过 props 接收业务数据 |
| 图标 | 简单图标使用 `@ant-design/icons`，无匹配图标时使用独立 1:1 React SVG |
| 状态 | 加载、空、错误、无权限、hover、focus、selected、disabled 保持可用 |
| 工程 | 目标测试、受影响 package 的 `typecheck`/`lint`/`build` 均有结果 |
