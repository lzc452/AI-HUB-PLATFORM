export const CONSOLE_BASENAME = "/console";

export const CONSOLE_DEFAULT_ROUTE = "/marketplace";

export const CONSOLE_DEFAULT_PATH = `${CONSOLE_BASENAME}${CONSOLE_DEFAULT_ROUTE}`;

function isSafeSameSitePath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("@") &&
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)
  );
}

/** 将 Console 内部路由转换为浏览器可访问的同域绝对路径。 */
export function toConsolePath(path: string): string {
  if (!isSafeSameSitePath(path)) {
    return CONSOLE_DEFAULT_PATH;
  }
  if (path === CONSOLE_BASENAME || path.startsWith(`${CONSOLE_BASENAME}/`)) {
    return path;
  }
  return `${CONSOLE_BASENAME}${path}`;
}

/** 将外部 `/console/*` 地址转换为 Router basename 下的内部路由。 */
export function toConsoleRoute(path: string): string {
  if (!isSafeSameSitePath(path)) {
    return CONSOLE_DEFAULT_ROUTE;
  }
  if (path === CONSOLE_BASENAME || path === `${CONSOLE_BASENAME}/`) {
    return "/";
  }
  if (path.startsWith(`${CONSOLE_BASENAME}/`)) {
    return path.slice(CONSOLE_BASENAME.length);
  }
  return path;
}

export interface ConsoleLocationLike {
  pathname: string;
  search?: string;
  hash?: string;
}

/** 保留当前 Console 深链的 pathname、query 与 hash，供登录回跳使用。 */
export function consoleReturnTo(location: ConsoleLocationLike): string {
  return toConsolePath(
    `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`,
  );
}

/**
 * 读取登录页回跳目标。仅接受同域路径，并统一转换为 Router 内部路由，
 * 避免开放重定向及 basename 重复拼接。
 */
export function resolveLoginReturnTo(
  search: string,
  stateFrom?: string,
): string {
  const queryReturnTo = new URLSearchParams(search).get("returnTo");
  const candidate = queryReturnTo ?? stateFrom ?? CONSOLE_DEFAULT_PATH;
  const route = toConsoleRoute(candidate);

  return route === "/login" || route.startsWith("/login?")
    ? CONSOLE_DEFAULT_ROUTE
    : route;
}

/**
 * SSO 回调先落到 Console 登录页完成 HttpOnly handoff，再回到原始深链。
 */
export function createConsoleSsoCallbackPath(returnTo: string): string {
  const destination = toConsolePath(returnTo);
  const search = new URLSearchParams({
    returnTo: destination,
    sso: "complete",
  });
  return `${CONSOLE_BASENAME}/login?${search.toString()}`;
}
