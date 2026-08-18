import DOMPurify from "dompurify";

// 与后端 content-security.ts 的 sanitizeRichText 白名单保持一致：仅允许基础排版标签
// 与少量安全属性。DOMPurify 默认会剥离 on* 事件处理器、<script>、<iframe> 以及
// javascript:/data: 等危险协议，因此此处以「白名单 + 默认安全策略」双重约束。
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

const RICH_TEXT_ALLOWED_ATTR = [
  "href",
  "title",
  "rel",
  "target",
  "src",
  "alt",
  "width",
  "height",
] as const;

// 与后端 content-security.ts 的协议白名单保持一致：仅允许 http/https/mailto/ftp/tel/file
// 以及相对路径与 HTML 实体；拒绝协议相对地址（//host）。负向先行断言 (?!//) 用于在
// 正则层直接拒绝协议相对地址（DOMPurify 本版本无 allowProtocolRelative 选项）。
const RICH_TEXT_ALLOWED_URI_REGEXP =
  /^(?!\/\/)(?:(?:(?:https?|mailto|ftp|tel|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))|(?:&(?:#\d+|#x[a-f0-9]+|[a-z0-9]+);))/i;

// 锚点强制加 rel，与后端清洗策略一致（缓解反向标签页劫持与 referral 泄露）。
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "A" && node.getAttribute("href") !== null) {
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

// 兜底拦截 data: 协议：DOMPurify 默认允许 data: 出现在 img/video 等标签（DATA_URI_TAGS
// 仅支持“追加”、无法移除），而本平台富文本不允许任何 data: URI（与后端白名单一致），
// 故在此钩子里显式丢弃 href/src 上的 data: 与协议相对地址，确保净化结果严格收敛。
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (data.attrName === "href" || data.attrName === "src") {
    const value = String(data.attrValue ?? "").trim().toLowerCase();
    if (value.startsWith("data:") || value.startsWith("//")) {
      data.keepAttr = false;
    }
  }
});

export function sanitizeRichText(html: string): string {
  if (typeof html !== "string") {
    return "";
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTR],
    ALLOWED_URI_REGEXP: RICH_TEXT_ALLOWED_URI_REGEXP,
  });
}
