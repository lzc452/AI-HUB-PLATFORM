export type MarketplaceSortMode = "latest" | "popular" | "recommended";

export interface MarketplaceHeroProps {
  onSortChange: (sort: MarketplaceSortMode) => void;
  sortMode: MarketplaceSortMode;
}

const sortTabs: ReadonlyArray<{ label: string; value: MarketplaceSortMode }> = [
  { label: "推荐", value: "recommended" },
  { label: "最新", value: "latest" },
  { label: "热门", value: "popular" },
];

/** 市场页排序切换：横向标签，当前项蓝色下划线。 */
export function MarketplaceHero({
  onSortChange,
  sortMode,
}: MarketplaceHeroProps) {
  return (
    <div
      aria-label="排序切换"
      className="flex items-center gap-2 border-b border-[#d9d9d9] pb-2"
    >
      {sortTabs.map((tab) => (
        <button
          aria-pressed={sortMode === tab.value}
          className={`border-0 bg-transparent px-3 py-1 text-sm font-medium transition-colors ${
            sortMode === tab.value
              ? "text-[#1677ff] shadow-[inset_0_-2px_0_0_#1677ff]"
              : "text-[#595959] hover:text-[#1677ff]"
          }`}
          key={tab.value}
          onClick={() => onSortChange(tab.value)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
