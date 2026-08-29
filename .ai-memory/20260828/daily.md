# 2026-08-28

## [团队启动] 通知系统完整实现 AgentTeams 启动

- **文件**: .learnings/LEARNINGS.md、.learnings/ERRORS.md、.learnings/FEATURE_REQUESTS.md（新建初始化）；团队计划存储于 .agent-teams/notification-complete/
- **决策**: 团队 notification-complete（6 成员、11 任务）：t1 规格 → t2/t3/t4/t5 实现并行（t6 依赖 t2）→ t7 → t8/t9 验证 → t10 集成 → t11 审查门禁；Portal 前端（t7）位于工作区外仓库 D:\workspace\AI-HUB-PORTAL，写入需权限升级审批
- **验证**: agent_teams_status 确认团队已批准运行，backend-engineer 正在执行 t1（in_progress）
- **学习**: 记录 taxonomy 单一来源最佳实践（LRN-20260828-001）与通知系统特性请求（FEAT-20260828-001）

## [团队交付] 通知系统完整实现全部 11 任务完成（2026-08-29）

- **文件**: packages/server/src/notification（countUnread/markAllRead/summary/read-all/payload 透传/授权器修复）；application/demand/analytics 接线（13 场景）；apps/web 通知前端（10 文件）；portal 后端 4 端点 + 文档 v1.4；AI-HUB-PORTAL 前端（apis/hooks/铃铛/通知页）；demo fixture 对齐；docs/specs/*（规格/双验证报告/验收/审查）
- **决策**: 成员轮次反复停滞 → captain 逐个接管实现与验证任务；存量问题（web lint 13、swagger 循环、web 测试 9、prettier 20）全部修复；reviewer 发现的 demand_collaborator 授权器 role 过滤缺陷已修复
- **验证**: pnpm verify EXIT=0；Portal typecheck/lint/test(50/50)/build 全绿；server 476/476、api 87/87、web 346/346；21 场景接线 21/21；审查 verdict=pass
- **学习**: LRN-20260829-001（授权器与收件人语义核对）、ERR-20260829-001（沙箱 vitest EPERM）、ERR-20260829-002（vitest unhandled errors）
