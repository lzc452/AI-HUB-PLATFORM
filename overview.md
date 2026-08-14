# AI Hub 平台 · 架构重设计与流程图优化（本次交付总览）

## 完成内容

1. **整体架构重设计**
   - 产出了 `docs/architecture-redesign.md`，包含当前状态梳理、风险识别、分层与上下文映射、V1→V2→V3 演进路线、3–5 年规划与 ADR 候选。
   - 新增 `docs/flowchart/00-architecture-redesign.{drawio,svg,png}`，作为整体架构总览与演进路线图。

2. **流程图全面优化（00–09）**
   - 重写了 `docs/flowchart/tools/generate-flowcharts.mjs` 引擎：
     - 自动折行 + 字号/高度自适应，解决**字体溢出**；
     - 容差锚点 `borderAnchor(tol=2)`，解决**箭头方向错乱**；
     - SVG 连线加粗、marker 增大、深色描边，解决**节点连线模糊**；
     - 内置 `--check` 校验重叠 / 越界 / waypoint 穿节点，确保交付质量。
   - 拆分数据到 `flowcharts-data.mjs`，便于维护；修正 00 图中 e8 等穿节点 waypoint。
   - 新增 `export-png.mjs`，基于 `@resvg/resvg-js` 以 **2x** 导出高清 PNG，解决**位图模糊**。
   - 重新生成全部 10 张图的 `.drawio`、`.svg`、`.png`，覆盖原 01–09 并新增 00。

3. **文档更新**
   - 更新 `docs/flowchart/README.md`：新增 00 图目录、SVG 链接、`--check` 与 `export-png.mjs` 使用说明，并关联架构重设计文档。

## 验证结果

- `node docs/flowchart/tools/generate-flowcharts.mjs --check` → **10/10 OK，无重叠 / 越界 / 穿节点**。
- `node docs/flowchart/tools/export-png.mjs` → **10 张 2x PNG 成功导出**（如 00：3080×2240）。
- 目视检查 `00-architecture-redesign.png`：中文渲染正常、无重叠、连线清晰。

## 关键变更文件

- `docs/architecture-redesign.md`（新增）
- `docs/flowchart/00-architecture-redesign.{drawio,svg,png}`（新增）
- `docs/flowchart/01-09-*.{drawio,svg,png}`（重新生成，覆盖原文件）
- `docs/flowchart/tools/generate-flowcharts.mjs`（重写）
- `docs/flowchart/tools/flowcharts-data.mjs`（新增，含 00–09 数据）
- `docs/flowchart/tools/export-png.mjs`（新增）
- `docs/flowchart/README.md`（更新）
- `docs/flowchart/tools/` 下清理临时调试文件（`_analyze.mjs`、`_probe.txt` 等）。

## 后续建议

- 将 `generate-flowcharts.mjs --check` 纳入文档类 PR 的 CI 门禁，防止流程图几何问题回归。
- 待业务需要时，按 `docs/architecture-redesign.md` 中 V2/V3 路线启动相应 ADR。
