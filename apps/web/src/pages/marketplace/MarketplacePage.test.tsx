import type { CatalogEntry } from "@ai-hub/contracts";
import { App as AntApp } from "antd";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MarketplacePage from "./MarketplacePage";

const mocks = vi.hoisted(() => ({
  useCatalogSearch: vi.fn(),
  useDepartments: vi.fn(),
}));

vi.mock("../../modules/marketplace/useCatalog", () => ({
  useCatalogSearch: mocks.useCatalogSearch,
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
});
