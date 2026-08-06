/** 市场页搜索关键词通过 URL query `q` 在 Header 与市场页之间共享。 */

export function readSearchQuery(): string {
  const params = new URLSearchParams(globalThis.window.location.search);
  return params.get("q") ?? "";
}

export function searchPath(value: string): string {
  const trimmed = value.trim();
  const base = "/marketplace";
  if (!trimmed) {
    return base;
  }
  return `${base}?q=${encodeURIComponent(trimmed)}`;
}
