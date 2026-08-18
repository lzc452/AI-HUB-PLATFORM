/**
 * 富文本安全展示组件。
 *
 * 内容经 DOMPurify 白名单清洗后才注入 DOM，作为客户端最后一道 XSS 防线
 * （服务端保存时也会用 sanitize-html 清洗并做拒绝式校验）。
 */
import { sanitizeRichText } from "./sanitize";

interface RichTextViewProps {
  html: string;
}

export function RichTextView({ html }: RichTextViewProps) {
  const safeHtml = sanitizeRichText(html);
  return (
    <div
      className="rich-text-view"
      style={{ lineHeight: 1.8, wordBreak: "break-word" }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
