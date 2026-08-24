# Portal 与 Console 同域路由

AI Hub 的员工门户占用同域根路径，原管理控制台固定部署在 `/console/`。Console 构建产物中的脚本、样式和图片均使用 `/console/` 作为 Vite base，React Router 同时使用 `/console` 作为 basename。

## 网关分流

- `/internal/*` 转发至 AI Hub API。
- `/console/*` 转发至现有 Console Web 容器，并保留原始 query。
- `/login`、`/marketplace`、`/applications`、`/innovation`、`/analytics`、`/organization`、`/security`、`/notifications`、`/creator`、`/assistant` 及其子路径使用 `308` 跳转至对应 `/console/*` 地址。
- 浏览器不会把 URL fragment 发送给网关；`308` 的 `Location` 不带新 fragment 时，浏览器按标准继承原 fragment，因此旧深链的 query 与 hash 都能保留。
- `/` 及 Portal 业务路由由 Portal 静态服务接管。Portal 服务接入网关前，现有根路径回源规则暂时保留，切流时再将该 upstream 替换为 Portal。

## 登录与 SSO 回跳

Console 未登录时跳转到 `/console/login?returnTo={完整Console路径}`。`returnTo` 包含 pathname、query 与 hash，并且只接受同域绝对路径。

钉钉 SSO 的 OAuth callback 先返回 `/console/login?sso=complete&returnTo=...`。登录页完成 HttpOnly handoff 后，再恢复原始 Console 深链。`aihub_sid`、`aihub_eid` 和 SSO 临时 Cookie 保持 `Path=/`，可同时覆盖 Portal 与 Console。

## 静态缓存

- `/console/index.html` 与所有 SPA fallback 响应使用 `Cache-Control: no-cache`，确保部署后及时读取新入口文件。
- `/console/assets/*` 为带内容哈希的 Vite 资源，使用 `Cache-Control: public, max-age=31536000, immutable`。
- `/console` 使用 `308` 规范化为 `/console/`，避免相对资源基址不一致。

发布前应验证直接打开 `/console/applications/{applicationId}?tab=delivery#web`、刷新页面、未登录回跳与 SSO 回跳四种场景。
