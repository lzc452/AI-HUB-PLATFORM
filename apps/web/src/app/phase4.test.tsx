import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("Phase 4 market shell", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/");
  });

  it("shows fixed market sections, search and trust labels", () => {
    render(<App />);

    expect(
      screen.getByRole("searchbox", { name: "搜索应用" }),
    ).toBeInTheDocument();
    expect(screen.getByText("最新上架")).toBeInTheDocument();
    expect(screen.getByText("热门应用")).toBeInTheDocument();
    expect(screen.getAllByText("已验证").length).toBeGreaterThan(0);
    expect(screen.getByText("平台助手")).toBeInTheDocument();
  });

  it("exposes notification and creator center routes", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /站内通知/ }));
    expect(
      screen.getByRole("heading", { name: "站内通知" }),
    ).toBeInTheDocument();

    globalThis.window.history.pushState({}, "", "/creator/app-platform");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "创作者中心" }),
    ).toBeInTheDocument();
  });
});
