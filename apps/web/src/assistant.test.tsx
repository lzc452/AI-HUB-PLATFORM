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
  });

  it("shows the degradation alert after sending a question", async () => {
    render(<App />);

    fireEvent.click(await screen.findByText("有什么适合数据分析的应用？"));

    expect(
      await screen.findByText("AI 助手暂时不可用，请稍后重试"),
    ).toBeInTheDocument();
    expect(screen.getByText("有什么适合数据分析的应用？")).toBeInTheDocument();
  });
});
