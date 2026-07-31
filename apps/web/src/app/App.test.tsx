import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

const styles = readFileSync(
  path.join(process.cwd(), "src", "styles.css"),
  "utf8",
);

describe("App", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/");
  });

  it("keeps Request and AbortSignal constructors compatible", () => {
    const signal = new AbortController().signal;

    expect(
      () => new Request("http://localhost/route-test", { signal }),
    ).not.toThrow();
  });

  it("renders a skip link and accessible primary navigation", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "跳到主要内容" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(
      screen.getByRole("navigation", { name: "主导航" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /应用市场/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /创新广场/ })).toBeInTheDocument();
  });

  it("lets the responsive header size itself to its content", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toHaveStyle({
      background: "#fff",
      height: "auto",
      lineHeight: "normal",
      padding: "0px",
    });
  });

  it("keeps the skip target focusable for keyboard users", () => {
    render(<App />);

    const skipLink = screen.getByRole("link", { name: "跳到主要内容" });
    const mainContent = screen.getByRole("main");

    skipLink.focus();

    expect(skipLink).toHaveFocus();
    expect(mainContent).toHaveAttribute("id", "main-content");
    expect(mainContent).toHaveAttribute("tabindex", "-1");
  });

  it("shows the marketplace status page by default", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "应用市场" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("该模块正在建设中，当前仅提供应用壳体与静态状态页。"),
    ).toBeInTheDocument();
  });

  it("navigates to the innovation square status page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /创新广场/ }));

    expect(
      screen.getByRole("heading", { name: "创新广场" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("需求提交、认领与试点流程将在后续任务中逐步接入。"),
    ).toBeInTheDocument();
  });

  it("keeps a reduced-motion baseline in the global stylesheet", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation-duration: 0.01ms !important;");
    expect(styles).toContain("scroll-behavior: auto !important;");
    expect(styles).toContain("transition-duration: 0.01ms !important;");
  });
});
