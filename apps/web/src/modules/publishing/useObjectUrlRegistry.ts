import { useCallback, useEffect, useRef } from "react";

/**
 * 管理预览用 objectURL 的生命周期。
 *
 * 背景：上传字段用 URL.createObjectURL 做本地即时预览，但 objectURL 会持有
 * Blob 引用，必须显式 revokeObjectURL，否则每次上传/切换图标都会泄漏一份
 * Blob（截图最多 6 张，向导反复编辑时累积明显）。
 *
 * 设计要点：
 * - 以 url 为键登记，便于在「替换/移除某一项」时精确释放单条，
 *   而不是卸载时一次性清空（后者会让仍在展示的预览图失效）；
 * - 组件卸载时兜底释放全部残留，避免路由离开后的泄漏。
 */
export function useObjectUrlRegistry() {
  const registry = useRef(new Set<string>());

  /** 登记一个新创建的 objectURL，返回值可直接用于 <img src>。 */
  const track = useCallback((url: string) => {
    registry.current.add(url);
    return url;
  }, []);

  /** 释放单个 URL（替换或移除该项时调用）。重复调用安全。 */
  const release = useCallback((url: string | undefined | null) => {
    if (url === undefined || url === null || url === "") return;
    if (!registry.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }, []);

  /** 按需释放一批（列表裁剪、批量移除时调用）。 */
  const releaseMany = useCallback(
    (urls: ReadonlyArray<string | undefined | null>) => {
      for (const url of urls) release(url);
    },
    [release],
  );

  // 卸载兜底：释放所有未释放的 objectURL，防止路由离开后泄漏。
  useEffect(() => {
    const owned = registry;
    return () => {
      for (const url of owned.current) URL.revokeObjectURL(url);
      owned.current.clear();
    };
  }, []);

  return { track, release, releaseMany };
}
