import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { sanitizeRichText } from "./sanitize";
import { RichTextView } from "./RichTextView";

/**
 * 高危-3 回归测试：富文本净化（存储型 XSS 防线）。
 *
 * 这些用例直接复现 XSS 攻击载荷，验证 `sanitizeRichText` / `RichTextView` 确实
 * 剥离了脚本、事件处理器、危险协议与危险标签；同时验证合法排版内容被保留。
 * 仅靠类型检查不能证明净化有效，必须做真实载荷注入与 DOM 断言。
 */
describe("sanitizeRichText - XSS 载荷中和", () => {
  it("剥离 <script> 标签", () => {
    const out = sanitizeRichText('<script>alert(1)</script><p>ok</p>');
    expect(out).not.toContain("<script");
    expect(out).toContain("<p>ok</p>");
  });

  it("剥离 <iframe> / <svg> 等危险标签", () => {
    expect(sanitizeRichText('<iframe src="evil"></iframe>')).not.toContain("iframe");
    expect(sanitizeRichText('<svg onload="alert(1)"></svg>')).not.toContain("svg");
  });

  it("删除 on* 事件处理器属性", () => {
    const out = sanitizeRichText('<img src="x" onerror="alert(1)" onload="x()">');
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("onload");
    expect(out.toLowerCase()).not.toContain("alert");
  });

  it("删除 javascript: 协议的 href", () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out.toLowerCase()).not.toContain('href=');
  });

  it("删除 data: 协议（与后端白名单一致）", () => {
    const payload =
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="x">';
    const out = sanitizeRichText(payload);
    expect(out.toLowerCase()).not.toContain("data:");
    expect(out.toLowerCase()).not.toContain('src="data');
  });

  it("删除协议相对地址 //host", () => {
    const out = sanitizeRichText('<a href="//evil.com/x">x</a>');
    expect(out.toLowerCase()).not.toContain("//evil.com");
    expect(out.toLowerCase()).not.toContain('href=');
  });

  it("保留合法排版标签与 http(s) 链接", () => {
    const html =
      '<p>a</p><strong>b</strong><em>c</em><ul><li>d</li></ul>' +
      '<a href="https://e.com" target="_blank">e</a>' +
      "<h2>f</h2><blockquote>g</blockquote><code>h</code><pre>i</pre>";
    const out = sanitizeRichText(html);
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toContain("<em>c</em>");
    expect(out).toContain("<ul><li>d</li></ul>");
    expect(out).toContain('href="https://e.com"');
    expect(out).toContain("<h2>f</h2>");
    expect(out).toContain("<blockquote>g</blockquote>");
    expect(out).toContain("<code>h</code>");
    expect(out).toContain("<pre>i</pre>");
  });

  it("锚点强制 rel=noopener noreferrer nofollow", () => {
    const out = sanitizeRichText('<a href="https://e.com">e</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("非字符串输入返回空串（不抛错、不回显原文）", () => {
    // @ts-expect-error 故意传入非字符串以验证防御
    expect(sanitizeRichText(undefined)).toBe("");
    // @ts-expect-error 故意传入非字符串以验证防御
    expect(sanitizeRichText(null)).toBe("");
  });
});

describe("RichTextView - 渲染层净化（真实 DOM 断言）", () => {
  it("dangerouslySetInnerHTML 注入的脚本不会进入真实 DOM", () => {
    const { container } = render(
      <RichTextView html='<script>alert(1)</script><p>safe</p>' />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("safe");
    expect(container.innerHTML.toLowerCase()).not.toContain("alert");
  });

  it("渲染合法链接并带上安全 rel", () => {
    const { container } = render(
      <RichTextView html='<a href="https://e.com">link</a>' />,
    );
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("https://e.com");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });

  it("渲染含 onerror 的图片后该处理器已消失", () => {
    const { container } = render(
      <RichTextView html='<img src="x" onerror="alert(1)">' />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.hasAttribute("onerror")).toBe(false);
  });
});
