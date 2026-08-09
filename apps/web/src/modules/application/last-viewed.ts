export const LAST_VIEWED_APPLICATION_KEY = "ai-hub.last-application";

/** 读取最近查看的应用 id（Header/侧边栏"创作者中心"等入口使用）。 */
export function readLastViewedApplicationId(): string | undefined {
  try {
    const raw = globalThis.sessionStorage?.getItem(LAST_VIEWED_APPLICATION_KEY);
    return raw && raw.length > 0 ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** 记录最近查看的应用 id（Header/侧边栏入口依赖该值）。 */
export function rememberLastViewedApplicationId(id: string): void {
  try {
    globalThis.sessionStorage?.setItem(LAST_VIEWED_APPLICATION_KEY, id);
  } catch {
    // sessionStorage 不可用时仅忽略
  }
}

export function clearLastViewedApplicationId(): void {
  try {
    globalThis.sessionStorage?.removeItem(LAST_VIEWED_APPLICATION_KEY);
  } catch {
    // sessionStorage 不可用时无需额外处理。
  }
}
