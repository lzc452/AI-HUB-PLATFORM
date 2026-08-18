/** 中间件可读取的最小请求形状（与 production.middleware.ts 约定一致，不引入 express 类型依赖）。 */
interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

type NextLike = () => void;

/** HttpOnly 会话 Cookie → 身份请求头的映射（与 PermissionGuard 的读取键保持一致）。 */
const IDENTITY_COOKIE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  aihub_eid: "x-employee-id",
  aihub_sid: "x-session-id",
});

/**
 * 将 HttpOnly 会话 Cookie（aihub_eid / aihub_sid）映射回身份请求头，
 * 桥接仍基于 @Headers("x-employee-id") / @Headers("x-session-id")
 * 读取身份的控制器代码路径。
 *
 * 背景：身份已迁移为 HttpOnly Cookie 承载（PermissionGuard 优先 Cookie、
 * 请求头兜底），但各控制器仍只读请求头，导致浏览器请求（仅带 Cookie）
 * 全部返回 IDENTITY_HEADERS_REQUIRED。本中间件在 Cookie 存在时将其写入
 * 请求头，使控制器与 PermissionGuard 的读取结果完全一致；未携带 Cookie
 * 的客户端（e2e 测试、脚本）保持原有请求头通道不变。
 */
export function createIdentityCookieBridge() {
  return (request: RequestLike, _response: unknown, next: NextLike) => {
    const cookie = request.headers.cookie;
    if (typeof cookie !== "string" || cookie.length === 0) {
      next();
      return;
    }
    for (const part of cookie.split(";")) {
      const index = part.indexOf("=");
      if (index === -1) {
        continue;
      }
      const key = part.slice(0, index).trim();
      const headerName = IDENTITY_COOKIE_HEADERS[key];
      if (headerName !== undefined) {
        // Cookie 覆盖同名请求头：与 PermissionGuard「Cookie 优先」的语义保持一致，
        // 避免同一请求在 guard（cookie 身份）与控制器（header 身份）间身份不一致。
        request.headers[headerName] = part.slice(index + 1).trim();
      }
    }
    next();
  };
}
