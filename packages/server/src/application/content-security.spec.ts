import { describe, it, expect } from "vitest";
import {
  sanitizeRichText,
  assertSafeRichText,
  assertSafeSvg,
} from "./content-security.js";

/**
 * 高危-3 回归测试（服务端）：富文本 / SVG 拒绝式白名单（fail-closed）。
 *
 * 与前端 DOMPurify 形成双层防线：服务端在落库前清洗并做拒绝式校验。
 * 用例直接复现 XSS 载荷，验证净化确实剥离危险内容，且危险输入被拒绝（抛错）。
 */
describe("sanitizeRichText - 服务端白名单清洗", () => {
  it("剥离 <script> 并保留合法 <p>", () => {
    const out = sanitizeRichText('<script>alert(1)</script><p>ok</p>');
    expect(out).not.toContain("<script");
    expect(out).toContain("<p>ok</p>");
  });

  it("剥离 javascript: / data: 协议的 href 与 src", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toContain(
      "javascript:",
    );
    expect(sanitizeRichText('<img src="data:image/svg+xml,PHN2Zz4=">')).not.toContain(
      "data:",
    );
  });

  it("强制锚点 rel 且移除危险事件处理器", () => {
    const out = sanitizeRichText('<a href="https://e.com" onmouseover="x()">x</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out.toLowerCase()).not.toContain("onmouseover");
  });

  it("保留合法排版与 http(s) 链接", () => {
    const html =
      "<p>a</p><strong>b</strong><ul><li>c</li></ul>" +
      '<a href="https://e.com">e</a><h2>f</h2><code>g</code><pre>h</pre>';
    const out = sanitizeRichText(html);
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toContain('href="https://e.com"');
  });

  it("非字符串输入抛错（绝不回显原文）", () => {
    // @ts-expect-error 故意传入非字符串以验证 fail-closed
    expect(() => sanitizeRichText(undefined)).toThrow();
  });
});

describe("assertSafeRichText - 拒绝式校验", () => {
  it("拒绝危险标签", () => {
    for (const tag of [
      "<script>",
      "<iframe>",
      "<svg>",
      "<object>",
      "<embed>",
      "<style>",
      "<link>",
      "<meta>",
      "<form>",
      "<video>",
      "<audio>",
      "<canvas>",
      "<input>",
      "<button>",
      "<textarea>",
      "<select>",
      "<foreignObject>",
      "<use>",
    ]) {
      expect(() => assertSafeRichText(tag)).toThrow();
    }
  });

  it("拒绝事件处理器", () => {
    expect(() => assertSafeRichText('<img src="x" onerror="alert(1)">')).toThrow();
    expect(() => assertSafeRichText("<div onclick=\"x()\">")).toThrow();
  });

  it("拒绝危险协议", () => {
    expect(() => assertSafeRichText('<a href="javascript:alert(1)">x</a>')).toThrow();
    expect(() => assertSafeRichText('<a href="vbscript:msgbox(1)">x</a>')).toThrow();
    expect(() => assertSafeRichText('<img src="data:image/svg+xml,x">')).toThrow();
  });

  it("拒绝 HTML 注释", () => {
    expect(() => assertSafeRichText("<!-- commented -->")).toThrow();
  });

  it("放行纯文本与基础排版", () => {
    expect(() => assertSafeRichText("<p>hello</p>")).not.toThrow();
    expect(() =>
      assertSafeRichText('<a href="https://e.com">link</a>'),
    ).not.toThrow();
  });
});

describe("assertSafeSvg - SVG 拒绝式校验", () => {
  it("拒绝完整 <svg> 包装（本平台不允许任意 svg 根标签，避免 SVG 内脚本）", () => {
    expect(() =>
      assertSafeSvg('<svg viewBox="0 0 1 1"><circle r="1"/></svg>'),
    ).toThrow();
  });

  it("拒绝 SVG 内嵌脚本 / 事件 / 外部引用 / foreignObject（不含顶层 svg 包装时仍校验内部危险节点）", () => {
    expect(() => assertSafeSvg("<script>alert(1)</script>")).toThrow();
    expect(() => assertSafeSvg('<rect onload="alert(1)">')).toThrow();
    expect(() => assertSafeSvg('<use href="http://x"></use>')).toThrow();
    expect(() => assertSafeSvg("<foreignObject></foreignObject>")).toThrow();
  });
});
