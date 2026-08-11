# 设计测量

## 原图纪律

设计图是视觉真相源。先用原始分辨率查看 PNG，再编码；不要只依赖缩略图或浏览器缩放后的印象。记录设计图实际宽高，并将其作为截图验证的目标视口。

## 必填产物

```text
DesignMeasurement
- sourceImage
- sourceWidth/sourceHeight
- targetViewport
- pageRegions: x/y/width/height
- spacing: horizontal/vertical
- typography: family/size/weight/lineHeight/color
- surfaces: background/border/radius/shadow
- icons: silhouette/fillMode/size/color/alignment
- responsiveEvidence
```

使用以下表格记录每个可见区域：

```text
区域 | 属性 | 设计值 | 证据/取样位置 | 实现策略
```

## 测量顺序

1. 页面级：视口、整体背景、顶部栏、侧栏、主内容起点和滚动边界。
2. 区域级：面板 x/y、宽高、列数、行数、布局方向和间距。
3. 控件级：输入框、按钮、Tabs、Table、Tag、Card 的尺寸、边框、圆角、颜色和状态。
4. 文本级：字体族、字号、字重、行高、颜色、截断和对齐。
5. 图标级：轮廓、填充/描边、尺寸、颜色、基线和与文字的间距。
6. 状态级：从设计图识别 selected、hover、disabled、success、error 等视觉状态。

## 事实与推断

将像素取样、元素边界和可见文字作为“测量事实”；将移动端折叠、溢出、动态内容和未展示状态作为“响应式推断”。推断优先沿用现有断点和组件行为；没有足够证据时进入决策门禁，不自行发明新的布局规则。

## 还原顺序

按页面骨架、布局区域、公共组件、Ant Design 状态、图标、阴影/边框/文字细节顺序实现。每完成一个区域就更新测量表和截图，不把多个未测量区域一次性堆进一个大组件。
