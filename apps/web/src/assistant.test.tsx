import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("assistant page", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/assistant");
  });

  it("renders the assistant welcome state with example questions", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "你好，我是 AI 助手" }),
    ).toBeInTheDocument();
    expect(screen.getByText("有什么适合数据分析的应用？")).toBeInTheDocument();
    // 推荐应用卡片在欢迎态即展示
    expect(screen.getByText("数据可视化平台")).toBeInTheDocument();
    expect(screen.getByText("报表自动生成")).toBeInTheDocument();
    expect(screen.getAllByText("查看应用详情")).toHaveLength(2);
  });

  it("hides suggestion chips and shows a warning after sending a question", async () => {
    render(<App />);

    fireEvent.click(await screen.findByText("有什么适合数据分析的应用？"));

    expect(
      await screen.findByText("AI 助手暂时不可用，请稍后重试"),
    ).toBeInTheDocument();
    // 发送后用户气泡出现，且建议问题胶囊已隐藏（仅剩一条匹配）
    expect(screen.getByText("有什么适合数据分析的应用？")).toBeInTheDocument();
    expect(screen.queryAllByText("推荐财务报销相关应用")).toHaveLength(0);
  });
});
