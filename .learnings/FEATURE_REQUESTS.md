# Feature Requests

Capabilities requested by the user.

---

## [FEAT-20260828-001] notification_complete

**Logged**: 2026-08-28T00:00:00Z
**Priority**: high
**Status**: in_progress
**Area**: backend

### Requested Capability
完整消息通知系统：1) 现有设计（DINGTALK_NOTIFICATION_MATRIX 21 场景）全部触发真实站内通知；2) 已读/未读功能完善（未读计数、批量全部已读、点击即读、轮询刷新）；3) 前端展示真实数据（移除硬编码演示字段）；4) AI-HUB-PORTAL 登录后铃铛徽标/通知页正常。

### User Context
前后端通知内容均为 seed 假数据；触发操作不产生通知；已读未读不完善；Portal 登录后无通知能力。

### Complexity Estimate
complex

### Suggested Implementation
见 docs/specs/notification-system.md（团队产出）与 docs/specs/notification-acceptance.md（验收）。

### Metadata
- Frequency: first_time
- Related Features: notification domain（packages/server/src/notification）、apps/web 通知页、AI-HUB-PORTAL 铃铛

---
