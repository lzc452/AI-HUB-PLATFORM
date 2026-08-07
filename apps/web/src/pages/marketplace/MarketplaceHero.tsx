import { LeftOutlined, RightOutlined } from "@ant-design/icons";

export type MarketplaceSortMode =
  | "latest"
  | "popular"
  | "rating"
  | "recommended";

export interface MarketplaceHeroProps {
  onPageChange: (page: number) => void;
  onSortChange: (sort: MarketplaceSortMode) => void;
  total: number;
  page: number;
  pageCount: number;
  sortMode: MarketplaceSortMode;
}

const sortTabs: ReadonlyArray<{ label: string; value: MarketplaceSortMode }> = [
  { label: "推荐", value: "recommended" },
  { label: "最新上架", value: "latest" },
  { label: "高评分", value: "rating" },
  { label: "热门应用", value: "popular" },
];

/** 市场页排序切换：横向 4 个 tab + 真分页箭头（左侧定位/右侧定位）。 */
export function MarketplaceHero({
  onPageChange,
  onSortChange,
  total,
  page,
  pageCount,
  sortMode,
}: MarketplaceHeroProps) {
  const totalText = total ? `共 ${total} 个应用 · 第 ${page} / ${pageCount} 页` : "";
  const canPrev = page > 1;
  const canNext = page < pageCount;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-[#d9d9d9] pb-2">
      <div
        aria-label="排序切换"
        className="flex items-center gap-1 overflow-x-auto"
        role="tablist"
      >
        {sortTabs.map((tab) => {
          const active = sortMode === tab.value;
          return (
            <button
              aria-pressed={active}
              className={`shrink-0 border-0 bg-transparent px-3 py-1 text-sm font-medium transition-colors ${
                active
                  ? "text-[#1677ff] shadow-[inset_0_-2px_0_0_#1677ff]"
                  : "text-[#595959] hover:text-[#1677ff]"
              }`}
              key={tab.value}
              onClick={() => onSortChange(tab.value)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      
      <div
        aria-label="分页导航"
        className="flex shrink-0 items-center gap-1"
        role="group"
      >
        <span className="text-xs text-[#595959] mr-2">{totalText}</span>
        <button
          aria-label="上一页"
          className={`flex h-8 w-8 items-center justify-center rounded-md border border-[#d9d9d9] bg-white text-[#595959] transition-all duration-200 hover:border-[#1677ff] hover:text-[#1677ff] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#d9d9d9] disabled:hover:text-[#595959] ${
            canPrev ? "" : ""
          }`}
          disabled={!canPrev}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          type="button"
        >
          <LeftOutlined aria-hidden="true" />
        </button>
        <button
          aria-label="下一页"
          className={`flex h-8 w-8 items-center justify-center rounded-md border border-[#d9d9d9] bg-white text-[#595959] transition-all duration-200 hover:border-[#1677ff] hover:text-[#1677ff] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#d9d9d9] disabled:hover:text-[#595959] ${
            canNext ? "" : ""
          }`}
          disabled={!canNext}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          type="button"
        >
          <RightOutlined aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
