# Innovation 设计验收

参考稿：

- [innovation.png](packages/ui/src/innovation.png)
- [innovationDetail.png](packages/ui/src/innovationDetail.png)

## 视口

- 1672×941：创新广场双列卡片、浅蓝标题区、筛选条、详情页 60/40 分栏和右侧治理抽屉均可见。
- 768×1024：筛选条换行，需求卡保持双列，详情正文与讨论区按平板宽度自然堆叠。
- 390×844：创新广场改单列；详情页标题、优先级指标和讨论输入纵向排列；治理抽屉和发起需求抽屉全屏展示；`document.documentElement.scrollWidth === clientWidth`。

## 交互

- 筛选关键词写入 `q` URL 参数，重置会清除全部筛选参数。
- 整张需求卡可键盘访问并进入 `/innovation/:demandId`。
- 需求点赞、评论点赞、Emoji、一级回复和举报入口可操作；点赞采用乐观更新。
- “更多 → 需求治理”打开抽屉，五组治理标签按权限展示；流程、优先级、协作者角色、进展/试点、解决方案、举报处理和匿名追溯入口可见。
- 发起需求抽屉包含标题、问题、期望结果、全员/部门/员工范围、匿名展示、保存草稿和提交审核。

浏览器视觉/交互验收使用本地临时演示数据源完成；真实 API 端到端验收因当前环境无法启动 Testcontainers/PostgreSQL 而未执行。

## 验证结果

- Web 全量：13 个测试文件、50 个测试通过。
- Server：30 个测试文件、126 个测试通过。
- 仓库级 `typecheck`、`lint`、`build` 通过。
- Database/API 集成测试：非集成测试通过；需要容器运行时的套件因环境返回 `Could not find a working container runtime strategy`。

final result: passed
