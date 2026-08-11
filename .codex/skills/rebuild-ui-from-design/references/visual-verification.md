# 视觉与工程验证

## 截图循环

```text
同视口捕获
→ 与原图叠加或差异检查
→ 记录偏差
→ 每次只修正一类根因
→ 重新捕获
→ 全部门槛通过
```

截图必须使用设计图原始宽高对应的浏览器视口；需要滚动的页面分别验证设计图可见区域和完整页面滚动状态。对比时使用 100% 显示比例，不用缩放后的印象判断尺寸。

## 偏差矩阵

```text
区域 | 设计值 | 实际值 | 偏差 | 根因 | 修正 | 状态
```

完成门槛：

- 核心布局、边距和尺寸误差不超过 2px。
- 图标尺寸和对齐误差不超过 1px。
- 设计图取样颜色与实现颜色一致。
- 页面结构、文本层级、边框、圆角、阴影和图标视觉一致。
- 字体抗锯齿等平台渲染噪声只能在人工复核后标记为已说明噪声。
- 不存在未说明的关键视觉偏差。

## 状态验证

保留并检查加载、空数据、错误、无权限、hover、focus、selected 和 disabled 状态。设计图未展示的状态遵循现有 Ant Design 和项目交互规范；视觉还原不能移除语义、键盘操作或焦点样式。

## 工程命令

先运行目标测试，再运行受影响 package 的命令：

```powershell
pnpm --filter @ai-hub/web test
pnpm --filter @ai-hub/web typecheck
pnpm --filter @ai-hub/web lint
pnpm --filter @ai-hub/web build
```

修改 `packages/ui` 时追加：

```powershell
pnpm --filter @ai-hub/ui test
pnpm --filter @ai-hub/ui typecheck
pnpm --filter @ai-hub/ui lint
pnpm --filter @ai-hub/ui build
```

最终报告必须列出设计图、路由、视口、关键测量、公共组件路径、图标决策、偏差矩阵、命令结果和仅剩的渲染噪声。
