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

  it("shows the permission-filtered marketplace by default", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "应用市场" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "只展示当前员工有权访问的已发布应用，排序采用固定运营规则。",
      ),
    ).toBeInTheDocument();
  });

  it("navigates to the innovation square demand page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /创新广场/ }));

    expect(
      screen.getByRole("heading", { name: "创新广场" }),
    ).toBeInTheDocument();
    expect(screen.getByText("结构化需求与受众治理")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "查看需求详情" }),
    ).toBeInTheDocument();
  });

  it("exposes organization and security administration routes", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /Organization/ }));
    expect(
      screen.getByRole("heading", { name: "Organization" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Security/ }));
    expect(
      screen.getByRole("heading", { name: "Security" }),
    ).toBeInTheDocument();
  });

  it("exposes the application administration navigation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /Applications/ }));

    expect(
      screen.getByRole("heading", { name: "Applications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Application details" }),
    ).toHaveAttribute("href", "/applications/app-001");
    expect(screen.getByRole("link", { name: "Versions" })).toHaveAttribute(
      "href",
      "/applications/app-001/versions",
    );
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/applications/app-001/review",
    );
    expect(screen.getByRole("link", { name: "Delivery" })).toHaveAttribute(
      "href",
      "/applications/app-001/delivery",
    );
  });

  it.each([
    ["/applications/app-001", "Application details"],
    ["/applications/app-001/versions", "Versions"],
    ["/applications/app-001/review", "Review"],
    ["/applications/app-001/delivery", "Delivery"],
  ])("renders the application route %s", (route, heading) => {
    globalThis.window.history.pushState({}, "", route);

    render(<App />);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("shows application lifecycle and delivery state labels", () => {
    globalThis.window.history.pushState({}, "", "/applications/app-001");

    render(<App />);

    for (const label of [
      "Draft",
      "In review",
      "Approved",
      "Published",
      "Rejected",
      "Withdrawn",
      "Archived",
      "Published version",
      "Loading",
      "Empty",
    ]) {
      expect(
        screen.getAllByText(label, { exact: true }).length,
      ).toBeGreaterThan(0);
    }
    expect(
      screen.getByText(
        "This is a static administration shell; no business writes are enabled.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps a reduced-motion baseline in the global stylesheet", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation-duration: 0.01ms !important;");
    expect(styles).toContain("scroll-behavior: auto !important;");
    expect(styles).toContain("transition-duration: 0.01ms !important;");
  });
});
