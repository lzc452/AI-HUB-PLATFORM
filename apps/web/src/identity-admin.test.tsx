import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("identity administration routes", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/console/");
  });

  it("exposes organization and security administration routes", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /组织管理/ }));
    // 组织页无 h1 标题：断言统计卡与页签（重建后的真实元素）
    expect(await screen.findByText("总用户")).toBeInTheDocument();
    expect(screen.getByText("部门数量")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "用户管理" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "部门管理" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("link", { name: /系统安全/ }));
    // 安全页无 h1 标题：断言审计日志页签与筛选栏
    expect(
      await screen.findByRole("tab", { name: "审计日志" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "导出日志" }),
    ).toBeInTheDocument();
  });
});
