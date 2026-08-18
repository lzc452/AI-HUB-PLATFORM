/**
 * 受限富文本与 SVG 的安全校验（拒绝式白名单，fail-closed）。
 *
 * 对应设计规格 §11.3：禁止任意 HTML、脚本与外部图片。此处采用「检测危险模式即拒绝」
 * 而非「清洗后放行」，避免手写 HTML 解析带来的 XSS 绕过风险。生产如需更强的富文本
 * 能力，可在本 seam 后接入 `sanitize-html` / DOMPurify 白名单清洗。
 */

import sanitizeHtml, { type AllowedAttributes } from "sanitize-html";

/** 富文本白名单允许的标签。 */
const RICH_TEXT_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "code",
  "pre",
  "span",
  "img",
] as const;

/** 仅放行白名单内属性；其余属性（如 style、class、on* 等）一律丢弃。 */
const RICH_TEXT_ALLOWED_ATTRIBUTES: AllowedAttributes = {
  a: ["href", "title", "rel", "target"],
  img: ["src", "alt", "width", "height"],
};

/** 仅允许的安全 URL 协议。 */
const RICH_TEXT_ALLOWED_SCHEMES = ["http", "https", "mailto"];

/** 判定给定 URL 是否为安全协议（http/https/mailto），拒绝 javascript:/data:/vbscript: 等。 */
function isSafeUrl(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim().toLowerCase();
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:")
  ) {
    return false;
  }
  return RICH_TEXT_ALLOWED_SCHEMES.some((scheme) =>
    trimmed.startsWith(`${scheme}:`),
  );
}

/**
 * 使用 `sanitize-html` 对受限富文本做白名单清洗（fail-closed）。
 *
 * - 仅保留 `RICH_TEXT_ALLOWED_TAGS` 中的标签。
 * - 仅保留白名单内属性；`on*` 事件处理器、`style` 等全部丢弃。
 * - `<a href>` 仅允许 http/https/mailto（并强制 `rel="noopener noreferrer nofollow"`）。
 * - `<img src>` 仅允许 http/https。
 * - 若库内部抛错，则向上抛出错误（绝不返回未清洗原文）。
 */
export function sanitizeRichText(html: string): string {
  if (typeof html !== "string") {
    throw new Error("RICH_TEXT_REQUIRED");
  }
  try {
    return sanitizeHtml(html, {
      allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
      allowedAttributes: RICH_TEXT_ALLOWED_ATTRIBUTES,
      allowedSchemes: RICH_TEXT_ALLOWED_SCHEMES,
      allowedSchemesAppliedToAttributes: ["href", "src"],
      allowProtocolRelative: false,
      transformTags: {
        a: (tagName, attribs) => ({
          tagName,
          attribs: {
            ...attribs,
            rel: "noopener noreferrer nofollow",
            href: isSafeUrl(attribs.href) ? (attribs.href ?? "") : "",
          },
        }),
        img: (tagName, attribs) => ({
          tagName,
          attribs: {
            ...attribs,
            src: isSafeUrl(attribs.src) ? (attribs.src ?? "") : "",
          },
        }),
      },
    });
  } catch {
    throw new Error("RICH_TEXT_SANITIZE_FAILED");
  }
}

/** 富文本中禁止出现的危险标签（含 SVG 与外部资源标签）。
 * 注意：img 已交由 sanitizeRichText 的白名单管控（仅允许 http/https 的 src），
 * 因此此处不再将 img 视为禁用，避免与白名单清洗后的输出冲突。 */
const FORBIDDEN_TAG_PATTERN =
  /<\s*(script|iframe|object|embed|style|link|meta|form|svg|video|audio|canvas|input|button|textarea|select|foreignObject|use)\b/i;

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
