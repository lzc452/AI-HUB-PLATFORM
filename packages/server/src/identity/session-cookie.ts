/**
 * 会话 Cookie 属性构造。
 *
 * 安全目标（对应《安全与业务 Bug 审查报告》高危-2 的修复建议）：
 * 会话凭据（sessionId）必须仅存在于后端下发的 **HttpOnly** Cookie 中，
 * 前端 JS 无法读取，从而阻断「XSS → 读取 localStorage/JS 变量 → 重放劫持」链路。
 * 同时需要 **SameSite=Lax** 缓解 CSRF，以及 **Secure** 防止明文 HTTP 降级泄露。
 *
 * `Secure` 不能在本地 http 开发环境下启用（否则浏览器拒绝种入），故按环境决定：
 * - 显式环境变量 `AIHUB_SESSION_COOKIE_SECURE=true|false` 优先；
 * - 缺省时，仅在生产（`NODE_ENV=production`，即走 https）开启。
 */

/** 构造 Cookie 属性串（`<name>=<value>; ` 之后的部分）。 */
export function buildSessionCookieAttributes(secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * 判断会话 Cookie 是否应标记 `Secure`。
 *
 * 优先级：显式覆盖环境变量 > 生产环境自动开启 > 其余（开发/测试）关闭。
 */
export function shouldSecureSessionCookie(): boolean {
  const override = process.env.AIHUB_SESSION_COOKIE_SECURE;
  if (override === "true") {
    return true;
  }
  if (override === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}
