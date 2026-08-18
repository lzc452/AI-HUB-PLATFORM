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

// 锚点强制加 rel，与后端清洗策略一致（缓解反向标签页劫持与 referral 泄露）。
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "A" && node.getAttribute("href") !== null) {
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

export function sanitizeRichText(html: string): string {
  if (typeof html !== "string") {
    return "";
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTR],
  });
}
