export const LAST_VIEWED_APPLICATION_KEY = "ai-hub.last-application";

/** 读取最近查看的应用 id（Header/侧边栏"创作者中心"等入口使用）。 */
export function readLastViewedApplicationId(): string | undefined {
  try {
    const raw = globalThis.sessionStorage?.getItem(
      LAST_VIEWED_APPLICATION_KEY,
    );
    return raw && raw.length > 0 ? raw : undefined;
  } catch {
    return undefined;
  }
}
