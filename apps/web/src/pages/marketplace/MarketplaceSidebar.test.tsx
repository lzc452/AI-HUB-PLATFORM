import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketplaceSidebar } from "./MarketplaceSidebar";
import { marketplaceGuideItems } from "./marketplaceGuide";

const mocks = vi.hoisted(() => ({
  useCatalogCategories: vi.fn(),
}));

vi.mock("../../modules/marketplace/useCatalog", () => ({
  useCatalogCategories: mocks.useCatalogCategories,
}));

/** 6 条分类：前 5 条热门，客户服务非热门（应被过滤）。 */
const categories = [
  { categoryId: "smart_assistant", name: "智能助手", isHot: true },
  { categoryId: "document_office", name: "文档办公", isHot: true },
  { categoryId: "data_analysis", name: "数据分析", isHot: true },
  { categoryId: "image_recognition", name: "图像识别", isHot: true },
  { categoryId: "finance_tax", name: "财务税务", isHot: true },
  { categoryId: "customer_service", name: "客户服务", isHot: false },
];

function renderSidebar(onSelectCategory = vi.fn()) {
  return render(<MarketplaceSidebar onSelectCategory={onSelectCategory} />);
}

describe("市场侧边栏热门分类", () => {
  beforeEach(() => {
    mocks.useCatalogCategories.mockReset();
    mocks.useCatalogCategories.mockReturnValue({
      data: [],
      error: null,
      isError: false,
      isPending: false,
    });
  });

  it("渲染热门分类标题并过滤 isHot 展示 5 条，隐藏非热门分类", () => {
    mocks.useCatalogCategories.mockReturnValue({
      data: categories,
      error: null,
      isError: false,
      isPending: false,
    });

    renderSidebar();

    expect(
      screen.getByRole("heading", { name: "热门分类" }),
    ).toBeInTheDocument();
    for (const name of [
      "智能助手",
      "文档办公",
      "数据分析",
      "图像识别",
      "财务税务",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "客户服务" }),
    ).not.toBeInTheDocument();
  });

  it("点击热门分类触发 onSelectCategory 回调（传入分类 ID）", () => {
    mocks.useCatalogCategories.mockReturnValue({
      data: categories,
      error: null,
      isError: false,
      isPending: false,
    });
    const onSelectCategory = vi.fn();

    renderSidebar(onSelectCategory);
    fireEvent.click(screen.getByRole("button", { name: "文档办公" }));

    expect(onSelectCategory).toHaveBeenCalledWith("document_office");
  });
});

describe("市场侧边栏使用指南", () => {
  it("渲染四个指南条目且初始不显示弹窗", () => {
    renderSidebar();

    for (const item of marketplaceGuideItems) {
      expect(
        screen.getByRole("button", { name: item.title }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("点击条目打开对应弹窗并展示引导句、步骤与提示", () => {
    renderSidebar();
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
    renderSidebar();
    const item = marketplaceGuideItems.find((entry) => entry.faq)!;

    fireEvent.click(screen.getByRole("button", { name: item.title }));

    const dialog = screen.getByRole("dialog");
    for (const { answer, question } of item.faq!) {
      expect(within(dialog).getByText(`问：${question}`)).toBeInTheDocument();
      expect(within(dialog).getByText(`答：${answer}`)).toBeInTheDocument();
    }
  });

  it("按 Escape 关闭弹窗后可重新打开其他条目", () => {
    renderSidebar();
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
