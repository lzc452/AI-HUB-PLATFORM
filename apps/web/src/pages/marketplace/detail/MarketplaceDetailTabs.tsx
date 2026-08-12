import { useSearchParams } from "react-router-dom";

export type DetailTab = "description" | "history" | "reviews" | "risk";

const VALID_TABS: readonly DetailTab[] = [
  "description",
  "history",
  "reviews",
  "risk",
];

const TAB_LABELS: ReadonlyArray<{ key: DetailTab; label: string }> = [
  { key: "description", label: "描述" },
  { key: "history", label: "版本历史" },
  { key: "reviews", label: "评价管理" },
  { key: "risk", label: "风险说明" },
];

function parseTab(raw: string | null): DetailTab {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as DetailTab;
  }
  return "description";
}

export interface MarketplaceDetailTabsProps {
  /** 由父级从 useSearchParams 解析并传入（便于测试与共享）。 */
  activeTab: DetailTab;
  /** 切换 tab 时回调；由父级写入 URL。 */
  onTabChange: (tab: DetailTab) => void;
}

/** 4 个 Tab 切换器（描述/版本历史/评价管理/风险说明），蓝色下划线激活态。 */
export function MarketplaceDetailTabs({
  activeTab,
  onTabChange,
}: MarketplaceDetailTabsProps) {
  return (
    <div
      aria-label="详情分区"
      className="flex overflow-x-auto border-b border-[#f0f0f0]"
      role="tablist"
    >
      {TAB_LABELS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            aria-selected={active}
            className={`relative shrink-0 px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff] ${
              active
                ? "font-medium text-[#1677ff] after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-[#1677ff] after:content-['']"
                : "text-[#595959] hover:text-[#1677ff]"
            }`}
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface UseDetailTabResult {
  activeTab: DetailTab;
  setTab: (tab: DetailTab) => void;
}

/** 详情页 URL ?tab= 同步工具；默认 description；replace 写入避免污染 history。 */
export function useDetailTabParam(): UseDetailTabResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const activeTab = parseTab(raw);

  const setTab = (tab: DetailTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "description") {
          next.delete("tab");
        } else {
          next.set("tab", tab);
        }
        return next;
      },
      { replace: true },
    );
  };

  return { activeTab, setTab };
}
