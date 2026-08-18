import { useEffect, useRef } from "react";
import { Button, Space, Tooltip } from "antd";
import { sanitizeRichText } from "./sanitize";
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  ClearOutlined,
} from "@ant-design/icons";

/**
 * 受限富文本编辑器（无依赖轻量实现，接口对齐 TipTap 以便后续替换）。
 *
 * 仅暴露白名单格式能力：加粗 / 斜体 / 下划线 / 有序列表 / 无序列表 / 标题 / 引用 /
 * 代码块 / 清除格式。输出 HTML 字符串，服务端再做一次拒绝式白名单校验（fail-closed）。
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "请输入内容…",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // 初始为 null：编辑器以预填内容挂载（如编辑回显）时也能执行首次同步。
  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    const element = editorRef.current;
    if (element !== null && value !== lastEmittedRef.current) {
      // 加载已保存内容时先清洗，避免存储型 XSS 借 contentEditable 注入。
      element.innerHTML = sanitizeRichText(value);
      lastEmittedRef.current = value;
    }
  }, [value]);

  const exec = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emit();
  };

  const emit = () => {
    const raw = editorRef.current?.innerHTML ?? "";
    // 提交前再清洗一次，确保送往上层的 HTML 已是白名单内的安全内容。
    const html = sanitizeRichText(raw);
    lastEmittedRef.current = html;
    onChange(html);
  };

  return (
    <div
      style={{
        border: "1px solid var(--ant-color-border, #d9d9d9)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Space
        wrap
        style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}
      >
        <Tooltip title="加粗">
          <Button
            size="small"
            icon={<BoldOutlined />}
            onClick={() => exec("bold")}
          />
        </Tooltip>
        <Tooltip title="斜体">
          <Button
            size="small"
            icon={<ItalicOutlined />}
            onClick={() => exec("italic")}
          />
        </Tooltip>
        <Tooltip title="下划线">
          <Button
            size="small"
            icon={<UnderlineOutlined />}
            onClick={() => exec("underline")}
          />
        </Tooltip>
        <Button size="small" onClick={() => exec("formatBlock", "h2")}>
          H2
        </Button>
        <Button size="small" onClick={() => exec("formatBlock", "h3")}>
          H3
        </Button>
        <Button size="small" onClick={() => exec("formatBlock", "blockquote")}>
          引用
        </Button>
        <Button size="small" onClick={() => exec("formatBlock", "pre")}>
          代码
        </Button>
        <Tooltip title="有序列表">
          <Button
            size="small"
            icon={<OrderedListOutlined />}
            onClick={() => exec("insertOrderedList")}
          />
        </Tooltip>
        <Tooltip title="无序列表">
          <Button
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={() => exec("insertUnorderedList")}
          />
        </Tooltip>
        <Tooltip title="清除格式">
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={() => exec("removeFormat")}
          />
        </Tooltip>
      </Space>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        style={{
          minHeight: 160,
          padding: 12,
          outline: "none",
          lineHeight: 1.7,
        }}
      />
    </div>
  );
}
