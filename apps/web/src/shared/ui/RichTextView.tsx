/**
 * 富文本安全展示组件。
 *
 * 内容来自服务端「拒绝式白名单校验」后的受限富文本，仅包含基础排版标签
 * （p/br/strong/em/u/ul/ol/li/h1-h4/blockquote/code/pre/a），此处直接渲染。
 */
interface RichTextViewProps {
  html: string;
}

export function RichTextView({ html }: RichTextViewProps) {
  return (
    <div
      className="rich-text-view"
      style={{ lineHeight: 1.8, wordBreak: "break-word" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
