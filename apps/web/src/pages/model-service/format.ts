/** 模型服务看板共用格式化工具。业务日口径为 Asia/Shanghai（PRD 9.4），展示时间固定按该时区渲染，避免不同浏览器时区把「晚上 11 点」显示成次日。 */

const SHANGHAI = "Asia/Shanghai";

export function formatTokenCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

/** 毫秒耗时：<1s 显示 ms，否则显示 s（一位小数）。 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** ISO 时刻 → 上海时区「MM-DD HH:mm:ss」。 */
export function formatShanghaiDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: SHANGHAI,
  });
}

/** ISO 时刻 → 上海时区「YYYY-MM-DD HH:mm」。 */
export function formatShanghaiShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: SHANGHAI,
    year: "numeric",
  });
}

/** 限额展示：null = 平台默认。 */
export function formatLimit(value: number | null): string {
  return value === null ? "默认" : formatTokenCount(value);
}
