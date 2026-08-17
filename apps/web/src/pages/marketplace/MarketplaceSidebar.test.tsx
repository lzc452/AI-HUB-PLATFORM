import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketplaceSidebar } from "./MarketplaceSidebar";
import { marketplaceGuideItems } from "./marketplaceGuide";

describe("市场侧边栏使用指南", () => {
  it("渲染四个指南条目且初始不显示弹窗", () => {
    render(<MarketplaceSidebar />);

    for (const item of marketplaceGuideItems) {
      expect(
        screen.getByRole("button", { name: item.title }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("点击条目打开对应弹窗并展示引导句、步骤与提示", () => {
    render(<MarketplaceSidebar />);
    const item = marketplaceGuideItems[0]!;

    fireEvent.click(screen.getByRole("button", { name: item.title }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(item.title)).toBeInTheDocument();
    expect(within(dialog).getByText(item.intro)).toBeInTheDocument();
    for (const step of item.steps) {
      expect(within(dialog).getByText(step)).toBeInTheDocument();
    }
    expect(within(dialog).getByText(item.tip!)).toBeInTheDocument();
  });

  it("FAQ 条目展示问答列表", () => {
    render(<MarketplaceSidebar />);
    const item = marketplaceGuideItems.find((entry) => entry.faq)!;

    fireEvent.click(screen.getByRole("button", { name: item.title }));

    const dialog = screen.getByRole("dialog");
    for (const { answer, question } of item.faq!) {
      expect(within(dialog).getByText(`问：${question}`)).toBeInTheDocument();
      expect(within(dialog).getByText(`答：${answer}`)).toBeInTheDocument();
    }
  });

  it("按 Escape 关闭弹窗后可重新打开其他条目", () => {
    render(<MarketplaceSidebar />);
    const first = marketplaceGuideItems[0]!;
    const second = marketplaceGuideItems[1]!;

    fireEvent.click(screen.getByRole("button", { name: first.title }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      keyCode: 27,
      which: 27,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: second.title }));
    expect(
      within(screen.getByRole("dialog")).getByText(second.title),
    ).toBeInTheDocument();
  });
});
