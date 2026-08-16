# V1 浏览器流程与五角色矩阵验收证据

执行时间：2026-08-16（Asia/Shanghai）
工具：本地 Playwright 1.57 + Chromium 143（headless，`deviceScaleFactor=1`）
目标：重建后的本地应用 `http://127.0.0.1:8080`（8/8 healthy，migration 0032）

## 五角色矩阵（`matrix/matrix.json` + 五张 marketplace 截图）

| 角色       | 菜单                                | 越权路由 403                                                                  | 非受众 direct-ID                     | 汇总     |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ | -------- |
| 普通员工   | 应用市场/创新广场/站内通知          | applications/analytics/organization/security/assistant 均渲染「没有访问权限」 | 创新专属与归档应用渲染「页面不存在」 | 符合矩阵 |
| 应用管理员 | +应用管理/数据看板                  | organization/security/assistant 403                                           | 同左                                 | 符合矩阵 |
| 创新运营   | 应用市场/创新广场/数据看板/站内通知 | applications/organization/security/assistant 403                              | 创新专属应用可访问，其余 404         | 符合矩阵 |
| 组织管理员 | +组织管理/数据看板                  | applications/security/assistant 403                                           | 全部非受众 404                       | 符合矩阵 |
| 超级管理员 | 全量菜单                            | 无 403                                                                        | 全部非受众 404                       | 符合矩阵 |

- 401：无会话访问 `/marketplace` → 重定向 `/login`。
- 禁止自审：应用管理员在本人 `in_review` 应用审核页领取按钮 `disabled=true`，
  他人应用 `disabled=false`（`flow-a/flow-a-evidence.json`）。

## 流程 B（`flow-b/flow-b-evidence.json`）

- 员工：点赞两次按一次切换（幂等 toggle）、键盘评分后 `我的评分=4` 星、
  评论、反馈提交均通过 UI 完成，无 console/4xx。
- 所有者：官方回复（`官方回复` Tag + 回复文本可见）、反馈管理内将员工反馈
  置为「已解决」并填写处理说明。
- 员工回看：官方回复与「已解决」状态均可见。
- 管理员：隐藏评论 → 「该评论已被管理员隐藏」；恢复 → 原文重新可见。

## 流程 A 浏览器补充（`flow-a/flow-a-evidence.json`）

- 恶意样本：上传 EICAR → 「扫描失败：检测到恶意文件，请更换制品后重试」，
  创建版本表单不再出现。
- 四渠道：交付配置页 `Web 应用/桌面端/移动端/小程序` 全部可见。
- （错误摘要/错误签名/并发认领已在隔离环境 API 层验证；浏览器以 EICAR 主路径
  与四渠道门禁断言为主。）

## 本轮浏览器驱动修复

- 反馈处理 PATCH 不再要求 `INTERACTION_MODERATE`，由服务层 owner/maintainer 校验。
- 新增所有者反馈管理：`GET feedback?scope=all` + PATCH + 前端管理卡（状态/说明/保存）。
- 新增官方回复 UI：`canReplyOfficial` 能力 + 根评论「回复」内联表单。
- 评分改为受控显示（`我的评分` 从真实 ratings 派生），避免评分后归零。
- 审核工作台所有者自审领取按钮禁用；上传失败后隐藏创建版本表单。
- 组织用户表格：角色/最近登录改为真实后端数据（`EmployeeSummary.roleNames/lastLoginAt`），
  接通用户详情 Modal。
- 修复创作者中心趋势图缺失日期范围（默认近 30 天）与 10 个发布应用缺少
  current_version 的 seed 回填。

## 设计验收（`design-pass/design-pass.json` + 63 张视口截图 + hover/focus + 21 张并置原图）

- 21/21 页面在 `1672×941`（19 页）/`2730×1536`（2 页）与 `768×1024`、`390×844`
  均截图且 `overflowX=0`；console 无错误、无未解释 4xx。
- 壳层几何：Header 56px、Sidebar 220px（本轮已修复原先 228px 偏差）、内容区自
  (220,56) 起，全部 20 个登录态页面一致；与 `docs/ui-design/frontend-ui-design.md`
  权威规范（Header 56、Sidebar 220/64）完全一致，偏差 0px。
- 键盘：登录 7 个可聚焦元素、管理页 11–115 个；焦点环 solid 可见。
- 状态：主按钮 hover/focus 截图、活动 Tab 记录；loading/empty/error/403 状态
  由既有组件与矩阵证据覆盖。
- 原图并置：每页 `*-design.png` 与 `*-{w}x{h}.png` 同目录配对。
- 程序化偏差矩阵：`design-pixel-matrix.json`（生成脚本 `design-pixel-matrix.mjs`），
  对 21 张原 PNG 逐像素测量 Header 底边与 Sidebar 右边框，并与 DOM 实测几何对照：
  - Sidebar：干净页面（应用市场 221、创新广场-详情 220、创作者中心 220.5 折算）
    与规范/实现 220 一致；其余页面原图测得 228–261，属 mockup 边框/内容噪声。
  - Header：原图测得 61–71，与规范/实现 56 存在 mockup 渲染差异（原图并非像素级
    蓝图，且登录/详情类页面为 30–40），需人工视觉确认。
  - 图标：实现侧边栏菜单图标 DOM 实测恒为 14×14、行高 40px；原图字形带测得
    17–33×17–26 的非稳定区间，字形级配对需人工视觉核对。
  - Modal：实现用户详情 520px、通知详情 640px（代码显式宽度）；原图面板边界测量
    不一致（637/532），无法在没有图像输入时给出可信基准。
- 剩余人工项：以上已把「布局/响应式/键盘/状态/console/network」收口，并将壳层
  几何偏差收敛到 0px；但「原图 vs 实现」的正文/图标字形逐像素 2px/1px 比对与
  原图 Modal 宽度基准，仍需一次具备图像输入的会话或人工视觉复核后关闭。
