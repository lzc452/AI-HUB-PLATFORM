import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Button, Tabs } from "antd";
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
  const totalText = total
    ? `共 ${total} 个应用 · 第 ${page} / ${pageCount} 页`
    : "";
  const canPrev = page > 1;
  const canNext = page < pageCount;

  return (
    <Tabs
      activeKey={sortMode}
      items={sortTabs.map((tab) => ({
        children: null,
        key: tab.value,
        label: tab.label,
      }))}
      onChange={(key) => onSortChange(key as MarketplaceSortMode)}
      tabBarExtraContent={{
        right: (
          <div
            aria-label="分页导航"
            className="flex items-center gap-1"
            role="group"
          >
            <span className="mr-2 text-xs text-[#595959]">{totalText}</span>
            <Button
              aria-label="上一页"
              disabled={!canPrev}
              icon={<LeftOutlined aria-hidden="true" />}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              size="small"
            />
            <Button
              aria-label="下一页"
              disabled={!canNext}
              icon={<RightOutlined aria-hidden="true" />}
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              size="small"
            />
          </div>
        ),
      }}
    />
  );
}
