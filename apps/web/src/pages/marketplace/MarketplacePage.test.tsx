import type { CatalogEntry } from "@ai-hub/contracts";
import { App as AntApp } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MarketplacePage from "./MarketplacePage";

const mocks = vi.hoisted(() => ({
  useCatalogSearch: vi.fn(),
  useCatalogCategories: vi.fn(),
  useDepartments: vi.fn(),
}));

vi.mock("../../modules/marketplace/useCatalog", () => ({
  useCatalogSearch: mocks.useCatalogSearch,
  useCatalogCategories: mocks.useCatalogCategories,
}));

vi.mock("../../modules/auth/useIdentity", () => ({
  useDepartments: mocks.useDepartments,
}));

function entry(name: string, ratingAverage: number | null): CatalogEntry {
  return {
    applicationId: `app-${name}`,
    name,
    summary: "",
    departmentId: "dept-rnd",
    categoryId: "productivity",
    categoryName: null,
    tagIds: [],
    trustLabels: [],
    currentVersionId: "v1",
    publishedAt: "2026-01-01T00:00:00.000Z",
    deliveryChannels: [],
    likeCount: 0,
    ratingAverage,
    ratingCount: 1,
    myRating: null,
    likedByMe: false,
    healthStatus: "healthy",
    deprecatedReason: null,
    replacementApplicationId: null,
  };
}

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={["/marketplace"]}>
        <MarketplacePage />
      </MemoryRouter>
    </AntApp>,
  );
}

describe("市场页评分最高排序", () => {
  beforeEach(() => {
    mocks.useCatalogSearch.mockReset();
    mocks.useCatalogCategories.mockReset();
    mocks.useCatalogCategories.mockReturnValue({
      data: [],
      error: null,
      isError: false,
      isPending: false,
    });
    mocks.useDepartments.mockReset();
    mocks.useDepartments.mockReturnValue({
      data: [],
      error: null,
      isError: false,
      isPending: false,
    });
    mocks.useCatalogSearch.mockReturnValue({
      data: {
        items: [entry("低分应用", 2), entry("高分应用", 5)],
        page: 1,
        pageSize: 6,
        total: 2,
      },
      error: null,
      isError: false,
      isPending: false,
    });
  });

  it("初始以 recommended 请求，切换到高评分后向服务端传 sort=rating", () => {
    renderPage();
    expect(mocks.useCatalogSearch).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "recommended" }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "高评分" }));

    const lastCall = mocks.useCatalogSearch.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ sort: "rating" });
    expect(
      mocks.useCatalogSearch.mock.calls.some(
        (call) => call[0].sort === "popular",
      ),
    ).toBe(false);
  });

  it("按服务端返回顺序渲染，不做页内评分重排", () => {
    // 服务端顺序：低分在前、高分在后 —— 若存在页内重排会把高分提前。
    renderPage();
    const cards = screen.getAllByLabelText(/^查看应用 /);
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "查看应用 低分应用",
      "查看应用 高分应用",
    ]);
  });

  it("选择部门后向服务端传 departmentId（不做页内过滤）", async () => {
    mocks.useDepartments.mockReturnValue({
      data: [{ departmentId: "dept-rnd", name: "研发部" }],
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    const departmentSelect = screen.getByLabelText("所属部门");
    fireEvent.mouseDown(departmentSelect);
    let option: HTMLElement | undefined;
    await waitFor(() => {
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".ant-select-item-option-content",
        ),
      );
      option = items.find((item) => item.textContent === "研发部");
      expect(option).toBeTruthy();
    });
    fireEvent.click(option!);

    await waitFor(() => {
      expect(mocks.useCatalogSearch).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dept-rnd" }),
      );
    });
  });

  it("未选择部门时请求不带 departmentId，渲染全部条目", () => {
    renderPage();
    expect(mocks.useCatalogSearch).toHaveBeenCalledWith(
      expect.not.objectContaining({ departmentId: expect.anything() }),
    );
    // 部门筛选不再做页内过滤：服务端返回的其他部门条目仍渲染。
    const cards = screen.getAllByLabelText(/^查看应用 /);
    expect(cards).toHaveLength(2);
  });
});
