import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/");
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
});
