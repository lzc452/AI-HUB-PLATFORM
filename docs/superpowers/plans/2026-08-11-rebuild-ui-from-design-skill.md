# `rebuild-ui-from-design` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建并验证项目级 `rebuild-ui-from-design` 技能，使 Agent 能把 `packages/ui/src` 的设计图按像素级标准还原到现有前端架构。

**Architecture:** 使用一个短小的 `SKILL.md` 维护顺序化执行契约，四个 `references/` 文件分别承载项目架构、设计测量、公共组件与图标、视觉验证规则。技能采用 RED-GREEN-REFACTOR：先用无技能新鲜上下文暴露遗漏，再写最小技能，用相同场景复测并收紧规则。

**Tech Stack:** Codex Skills、Markdown、YAML、Python `init_skill.py`/`quick_validate.py`、CodeGraph、React 19、Ant Design 6、TailwindCSS 4、Vitest

## Global Constraints

- 项目默认语言为简体中文；标识符、路径、命令、配置键和技术专名保持英文。
- 技能安装在 `.codex/skills/rebuild-ui-from-design`，模型可自动调用。
- 默认一次处理一张设计图或一组关联页面；只有用户明确要求时才批量处理。
- 设计图是视觉真相源，现有代码是业务行为真相源。
- 跨页面复用组件统一放入 `apps/web/src/components/common`。
- 核心布局与间距误差不超过 2px，图标尺寸与对齐误差不超过 1px，取样颜色一致。
- 简单图标使用 `@ant-design/icons`；复杂图标使用 1:1 React SVG 组件。
- 修改 Ant Design 全局主题或样式时，验证所有受影响的相似组件与路由。
- 不创建 `README.md`、安装说明、技能 `assets/` 或项目新依赖。

---

### Task 1: RED 基线测试

**Files:**
- Read: `packages/ui/src/组织管理-角色管理.png`
- Read: `apps/web/src/pages/organization/OrganizationPage.tsx`
- Read: `apps/web/src/pages/organization/components/roles/RoleManagementTab.tsx`
- Read: `apps/web/src/components/common/index.ts`
- Create: 无；测试原始输出保留在当前任务记录中，不写入仓库。

**Interfaces:**
- Consumes: 已批准设计规格 `docs/superpowers/specs/2026-08-11-rebuild-ui-from-design-skill-design.md`。
- Produces: 无技能基线输出和逐字失败模式，供 Task 2–5 的技能规则使用。

- [ ] **Step 1: 启动无技能新鲜上下文场景**

使用 `fork_turns: "none"` 启动只读子 Agent，不提供本设计规格、预期答案或待创建技能。发送以下原始任务：

```text
这是一次真实的前端任务，只做分析并报告你会立即执行的步骤，不要修改文件。产品要求你今天把 packages/ui/src/组织管理-角色管理.png 1:1 还原到现有页面；时间很紧，现有页面已经能工作，允许改 Ant Design 全局样式。必须保留当前技术架构并尽快交付。请检查仓库后给出具体实施与验收方案。
```

- [ ] **Step 2: 记录基线遗漏**

逐字保留子 Agent 的选择与理由，并按以下可观察项评分：

```text
原始视口与设计图尺寸
CodeGraph 调用链与影响面
当前页面同视口截图基线
坐标/尺寸/间距/颜色测量表
components/common 跨页面复用检查
Ant Design Icon 与复杂 SVG 分流
全局主题/样式的全路由回归范围
2px/1px/颜色验收阈值
加载/空/错误/权限/交互状态
目标测试、typecheck、lint、build
```

Expected: 至少缺少一项或用“目测接近”“最后再看”等方式弱化一项，基线为 RED。若十项全部明确且可执行，停止创作并报告该技能没有可证明的行为增益。

- [ ] **Step 3: 归纳规则形态**

把遗漏分为三类：顺序被跳过、必填产物缺失、条件分支错误。顺序问题写为门禁，缺失问题写为固定产出结构，分支问题写为可观察条件。

### Task 2: 初始化技能并写主执行契约

**Files:**
- Create: `.codex/skills/rebuild-ui-from-design/SKILL.md`
- Create: `.codex/skills/rebuild-ui-from-design/agents/openai.yaml`
- Create: `.codex/skills/rebuild-ui-from-design/references/`

**Interfaces:**
- Consumes: Task 1 的失败模式。
- Produces: 可触发的 `$rebuild-ui-from-design` 技能入口和四个 reference 指针。

- [ ] **Step 1: 使用官方脚本初始化**

Run:

```powershell
& 'C:/Users/lizhicai/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' C:/Users/lizhicai/.codex/skills/.system/skill-creator/scripts/init_skill.py rebuild-ui-from-design --path D:/workspace/AI-HUB-PLATFORM/.codex/skills --resources references --interface 'display_name=设计图像素级前端还原' --interface 'short_description=按项目架构将 packages/ui/src 设计图像素级还原为可复用前端组件' --interface 'default_prompt=使用 $rebuild-ui-from-design 按原始视口高保真实现 packages/ui/src 中指定的设计图。'
```

Expected: 创建技能目录、`SKILL.md`、`agents/openai.yaml` 和空的 `references/`。

- [ ] **Step 2: 将 `SKILL.md` 改为顺序化执行契约**

主文件必须使用以下 frontmatter：

```yaml
---
name: rebuild-ui-from-design
description: Use when Codex 需要根据 packages/ui/src 中的 PNG 设计图实现或校准 AI Hub Platform 前端，包括像素级布局、Ant Design/TailwindCSS 样式、跨页面公共组件、图标匹配、复杂 SVG 还原或截图差异验证。
---
```

正文按以下固定顺序组织：

```text
Overview：声明“双真相源”和单图完成原则。
Required workflow：锁定目标 → 读取四个 references → 建立视觉规格 → 检查架构 → 捕获 RED 基线 → 分层实现 → 视觉收敛 → 工程验证 → 报告证据。
Completion contract：必须输出设计图/路由/视口、影响清单、测量矩阵、组件复用结论、图标决策、视觉偏差矩阵和验证命令。
Decision gates：资源、路由、业务冲突、响应式推断和全局影响不确定时请求用户决策。
Quick reference：设计、代码、主题、视觉四类真相源与对应检查。
Common mistakes：按 Task 1 的真实遗漏写正向修正，不添加未观察到的假想规则。
```

主流程必须直接链接：

```markdown
[项目架构](references/project-architecture.md)
[设计测量](references/design-measurement.md)
[组件与图标](references/component-and-icon-rules.md)
[视觉验证](references/visual-verification.md)
```

- [ ] **Step 3: 校验 UI 元数据**

`agents/openai.yaml` 必须精确包含：

```yaml
interface:
  display_name: "设计图像素级前端还原"
  short_description: "按项目架构将 packages/ui/src 设计图像素级还原为可复用前端组件"
  default_prompt: "使用 $rebuild-ui-from-design 按原始视口高保真实现 packages/ui/src 中指定的设计图。"
```

- [ ] **Step 4: 提交主契约**

```powershell
git add .codex/skills/rebuild-ui-from-design/SKILL.md .codex/skills/rebuild-ui-from-design/agents/openai.yaml
git commit -m "技能：初始化设计图前端还原工作流"
```

### Task 3: 编写项目架构与设计测量 references

**Files:**
- Create: `.codex/skills/rebuild-ui-from-design/references/project-architecture.md`
- Create: `.codex/skills/rebuild-ui-from-design/references/design-measurement.md`

**Interfaces:**
- Consumes: `SKILL.md` 的架构检查和视觉规格步骤。
- Produces: `ArchitectureImpact` 与 `DesignMeasurement` 两类固定产物。

- [ ] **Step 1: 编写 `project-architecture.md`**

文件必须定义以下完成产物，不缓存可从配置直接读取的版本号：

```text
ArchitectureImpact
- targetImage
- targetRoute
- pageEntry
- callPaths
- dataHooks
- permissionGuards
- existingCommonComponents
- pageLocalComponents
- themeFiles
- affectedRoutes
- verificationCommands
```

规则必须包含：仓库有 `.codegraph/` 时先用 `codegraph explore`；保留 `pages` 编排、`modules` 数据与业务状态、router/guards 权限边界；优先扩展 `components/common`；全局主题改动前列出全部调用点；项目事实以 `package.json`、路由和当前源码为准。

- [ ] **Step 2: 编写 `design-measurement.md`**

文件必须要求在原图查看并输出：

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

测量表使用：

```text
区域 | 属性 | 设计值 | 证据/取样位置 | 实现策略
```

要求把可直接测量事实与响应式推断分开；没有证据的响应式行为沿用现有断点，无法可靠推断时进入决策门禁。

- [ ] **Step 3: 提交两份 references**

```powershell
git add .codex/skills/rebuild-ui-from-design/references/project-architecture.md .codex/skills/rebuild-ui-from-design/references/design-measurement.md
git commit -m "技能：补充架构检查与设计测量规则"
```

### Task 4: 编写公共组件、图标和视觉验证 references

**Files:**
- Create: `.codex/skills/rebuild-ui-from-design/references/component-and-icon-rules.md`
- Create: `.codex/skills/rebuild-ui-from-design/references/visual-verification.md`

**Interfaces:**
- Consumes: `ArchitectureImpact`、`DesignMeasurement`。
- Produces: `ReuseDecision`、`IconDecision`、`VisualDiff` 和可执行工程验证命令。

- [ ] **Step 1: 编写 `component-and-icon-rules.md`**

文件必须固定样式优先级：

```text
现有 components/common → Ant Design 组件/props → TailwindCSS 局部布局 → packages/ui/src/theme.ts token/component token → 带业务作用域的全局选择器
```

每个候选模式输出：

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

相同视觉与交互模式出现在两个及以上页面时，`action` 必须为 `extend` 或 `create`，目标位于 `apps/web/src/components/common`；公共组件通过 props 接收业务数据，不在内部获取页面数据。

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

简单匹配使用 `@ant-design/icons`；无合适候选时创建 React SVG 组件，并精确还原 `viewBox`、path、stroke、fill、linecap 和 linejoin。

- [ ] **Step 2: 编写 `visual-verification.md`**

文件必须定义以下循环：

```text
同视口捕获 → 叠加/差异检查 → 记录偏差 → 每次只修正一类根因 → 重新捕获 → 全部门槛通过
```

偏差矩阵固定为：

```text
区域 | 设计值 | 实际值 | 偏差 | 根因 | 修正 | 状态
```

门槛固定为：核心布局/边距/尺寸 ≤2px，图标尺寸/对齐 ≤1px，取样颜色一致；字体抗锯齿只能作为人工复核后的已说明渲染噪声。还必须检查加载、空、错误、无权限、hover、focus、selected 和 disabled 状态。

工程验证固定为目标测试优先，随后执行：

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

- [ ] **Step 3: 提交两份 references**

```powershell
git add .codex/skills/rebuild-ui-from-design/references/component-and-icon-rules.md .codex/skills/rebuild-ui-from-design/references/visual-verification.md
git commit -m "技能：补充公共组件图标与视觉验收规则"
```

### Task 5: GREEN 与 REFACTOR 前向测试

**Files:**
- Modify if required: `.codex/skills/rebuild-ui-from-design/SKILL.md`
- Modify if required: `.codex/skills/rebuild-ui-from-design/references/*.md`
- Create: 无；测试 Agent 不允许修改仓库。

**Interfaces:**
- Consumes: 完整技能目录和 Task 1 的相同场景。
- Produces: 逐项合规结果、新遗漏和完成收敛后的技能文本。

- [ ] **Step 1: 使用相同单图场景复测**

以 `fork_turns: "none"` 启动只读子 Agent，发送：

```text
使用 $rebuild-ui-from-design（技能位于 D:/workspace/AI-HUB-PLATFORM/.codex/skills/rebuild-ui-from-design）完成以下任务。只分析并报告会立即执行的步骤，不要修改文件：产品要求你今天把 packages/ui/src/组织管理-角色管理.png 1:1 还原到现有页面；时间很紧，现有页面已经能工作，允许改 Ant Design 全局样式。必须保留当前技术架构并尽快交付。请检查仓库后给出具体实施与验收方案。
```

Expected: Task 1 的十项评分全部明确且可执行，并引用四份 reference 中适用的规则。

- [ ] **Step 2: 使用跨页面场景复测**

启动另一个 `fork_turns: "none"` 只读子 Agent，发送：

```text
使用 $rebuild-ui-from-design（技能位于 D:/workspace/AI-HUB-PLATFORM/.codex/skills/rebuild-ui-from-design）分析 packages/ui/src/组织管理.png、组织管理-部门管理.png、组织管理-角色管理.png。用户明确要求把这组关联页面一起实现，并要求跨页面区域统一复用。不要修改文件，请给出组件边界、公共组件路径、样式影响面和逐图验收顺序。
```

Expected: 明确批量请求已获授权；识别跨页面模式并放入 `apps/web/src/components/common`；仍按逐图视觉门禁完成；不把业务数据 hooks 移入公共组件。

- [ ] **Step 3: 收紧真实漏洞并复测**

若出现新遗漏，逐字记录其理由，按“门禁/固定产物/条件分支”修改唯一权威位置；重复相同场景直到不再出现新遗漏。不要把测试结论复制到多个文件。

- [ ] **Step 4: 提交测试驱动的修订**

仅在文件实际变化时执行：

```powershell
git add .codex/skills/rebuild-ui-from-design
git commit -m "技能：收紧设计图还原验收门禁"
```

### Task 6: 结构、元数据与官方校验

**Files:**
- Verify: `.codex/skills/rebuild-ui-from-design/SKILL.md`
- Verify: `.codex/skills/rebuild-ui-from-design/agents/openai.yaml`
- Verify: `.codex/skills/rebuild-ui-from-design/references/*.md`
- Temporary only: `tmp/rebuild-ui-skill-validator-deps/`

**Interfaces:**
- Consumes: GREEN 状态的技能目录。
- Produces: 官方校验通过记录、引用完整性结果和无冗余文件的部署目录。

- [ ] **Step 1: 运行静态完整性检查**

Run:

```powershell
rg -n "T[B]D|T[O]DO|[待]定|[占]位" .codex/skills/rebuild-ui-from-design
rg -n "project-architecture.md|design-measurement.md|component-and-icon-rules.md|visual-verification.md" .codex/skills/rebuild-ui-from-design/SKILL.md
git diff --check
```

Expected: 第一条没有匹配；第二条四个引用全部存在；`git diff --check` 无输出。

- [ ] **Step 2: 为官方校验器准备临时 `PyYAML`**

系统 Python 当前缺少 `yaml`。将依赖安装到已验证的项目临时目录，不修改仓库依赖清单：

```powershell
New-Item -ItemType Directory -Force -Path D:/workspace/AI-HUB-PLATFORM/tmp/rebuild-ui-skill-validator-deps
& 'C:/Users/lizhicai/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -m pip install PyYAML --target D:/workspace/AI-HUB-PLATFORM/tmp/rebuild-ui-skill-validator-deps
```

Expected: 临时目录包含 `yaml` 模块。若网络沙箱阻止下载，使用权限请求重试同一命令，不更换为未审计的校验器。

- [ ] **Step 3: 运行 `quick_validate.py`**

Run:

```powershell
& 'C:/Users/lizhicai/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -c "import runpy,sys; sys.path.insert(0,r'D:/workspace/AI-HUB-PLATFORM/tmp/rebuild-ui-skill-validator-deps'); sys.argv=[r'quick_validate.py',r'D:/workspace/AI-HUB-PLATFORM/.codex/skills/rebuild-ui-from-design']; runpy.run_path(r'C:/Users/lizhicai/.codex/skills/.system/skill-creator/scripts/quick_validate.py',run_name='__main__')"
```

Expected: `Skill is valid!`

- [ ] **Step 4: 清理任务创建的临时依赖**

先用 `Resolve-Path` 确认目标严格等于 `D:/workspace/AI-HUB-PLATFORM/tmp/rebuild-ui-skill-validator-deps` 且位于仓库 `tmp` 下，再使用 PowerShell `Remove-Item -LiteralPath ... -Recurse -Force` 删除。不要触碰 `tmp` 的其他内容。

### Task 7: 更新处理看板并完成验证

**Files:**
- Modify: `processing_visualization.html`
- Verify: `docs/superpowers/specs/2026-08-11-rebuild-ui-from-design-skill-design.md`
- Verify: `docs/superpowers/plans/2026-08-11-rebuild-ui-from-design-skill.md`
- Verify: `.codex/skills/rebuild-ui-from-design/**`

**Interfaces:**
- Consumes: 官方校验通过的技能和前向测试结论。
- Produces: 项目历史记录、最终 diff、完成提交。

- [ ] **Step 1: 更新 `processing_visualization.html`**

在 `seedData.tasks` 添加或更新 `dev` 任务，事实性记录项目技能、分层 references、像素门槛和前向测试结果；在 `events` 增加同日记录。保持现有数据结构和中文文案。

- [ ] **Step 2: 运行最终验证**

Run:

```powershell
git diff --check
git status --short
```

Expected: 本计划只新增技能并修改处理看板；开始实施前已经存在的 `.qoder/`、`apps/web/src/pages/security/SecurityPage.tsx`、`apps/web/src/styles.css`、`apps/web/src/modules/security/` 和 `apps/web/src/pages/security/components/` 保持不暂存、不覆盖。

- [ ] **Step 3: 提交处理看板和最终修订**

```powershell
git add processing_visualization.html .codex/skills/rebuild-ui-from-design docs/superpowers/plans/2026-08-11-rebuild-ui-from-design-skill.md
git commit -m "技能：完成设计图像素级前端还原能力"
```

- [ ] **Step 4: 交付证据**

最终报告列出技能入口、四份 references、两类前向测试结果、`quick_validate.py` 输出、提交记录和未触碰的既有工作区改动。不宣称已实际还原任何产品页面；本任务交付物是经过测试的项目技能。
