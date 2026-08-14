/**
 * 受限富文本与 SVG 的安全校验（拒绝式白名单，fail-closed）。
 *
 * 对应设计规格 §11.3：禁止任意 HTML、脚本与外部图片。此处采用「检测危险模式即拒绝」
 * 而非「清洗后放行」，避免手写 HTML 解析带来的 XSS 绕过风险。生产如需更强的富文本
 * 能力，可在本 seam 后接入 `sanitize-html` / DOMPurify 白名单清洗。
 */

/** 富文本中禁止出现的危险标签（含 SVG 与外部资源标签）。 */
const FORBIDDEN_TAG_PATTERN =
  /<\s*(script|iframe|object|embed|style|link|meta|form|img|svg|video|audio|canvas|input|button|textarea|select|foreignObject|use)\b/i;

/** 事件处理器（onclick 等）。 */
const EVENT_HANDLER_PATTERN = /\son\w+\s*=/i;

/** javascript: / vbscript: 等危险协议。 */
const DANGEROUS_PROTOCOL_PATTERN = /\s*(javascript|vbscript|data)\s*:/i;

/** HTML 注释（可用于隐藏注入内容）。 */
const HTML_COMMENT_PATTERN = /<\s*!--/;

/**
 * 校验受限富文本：只允许基础排版节点（p/br/strong/em/u/ul/ol/li/h1-h4/
 * blockquote/code/pre/a）。命中危险模式即抛出 Error（由上层映射为 400）。
 */
export function assertSafeRichText(html: string): void {
  if (html === undefined || html === null) {
    throw new Error("RICH_TEXT_REQUIRED");
  }
  if (FORBIDDEN_TAG_PATTERN.test(html)) {
    throw new Error("RICH_TEXT_FORBIDDEN_TAG");
  }
  if (EVENT_HANDLER_PATTERN.test(html)) {
    throw new Error("RICH_TEXT_EVENT_HANDLER");
  }
  if (DANGEROUS_PROTOCOL_PATTERN.test(html)) {
    throw new Error("RICH_TEXT_DANGEROUS_PROTOCOL");
  }
  if (HTML_COMMENT_PATTERN.test(html)) {
    throw new Error("RICH_TEXT_COMMENT");
  }
}

/**
 * 校验 SVG 图标内容：移除内嵌脚本、事件处理器、外部引用与 foreignObject。
 * 命中危险模式即抛出 Error（由上层映射为 400）。
 */
export function assertSafeSvg(svg: string): void {
  if (svg === undefined || svg === null) {
    throw new Error("SVG_REQUIRED");
  }
  if (FORBIDDEN_TAG_PATTERN.test(svg)) {
    throw new Error("SVG_FORBIDDEN_TAG");
  }
  if (EVENT_HANDLER_PATTERN.test(svg)) {
    throw new Error("SVG_EVENT_HANDLER");
  }
  if (/\s(href|xlink:href)\s*=\s*["']\s*[^#]/i.test(svg)) {
    throw new Error("SVG_EXTERNAL_REFERENCE");
  }
  if (DANGEROUS_PROTOCOL_PATTERN.test(svg)) {
    throw new Error("SVG_DANGEROUS_PROTOCOL");
  }
  if (HTML_COMMENT_PATTERN.test(svg)) {
    throw new Error("SVG_COMMENT");
  }
}
