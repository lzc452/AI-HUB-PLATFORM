import { FireOutlined, LikeOutlined, StarOutlined } from "@ant-design/icons";
import { Typography } from "antd";

const { Text, Title } = Typography;

export type MarketplaceSortMode = "latest" | "popular" | "rating" | "recommended";

export interface MarketplaceHeroProps {
  onSortChange: (sort: MarketplaceSortMode) => void;
  sortMode: MarketplaceSortMode;
}

const quickLinks: ReadonlyArray<{
  icon: React.ReactNode;
  label: string;
  sort: MarketplaceSortMode;
}> = [
  {
    icon: <LikeOutlined aria-hidden="true" className="text-[#1677ff]" />,
    label: "管理员推荐",
    sort: "recommended",
  },
  {
    icon: <StarOutlined aria-hidden="true" className="text-[#1677ff]" />,
    label: "最新上架",
    sort: "latest",
  },
  {
    icon: <FireOutlined aria-hidden="true" className="text-[#f5222d]" />,
    label: "热门应用",
    sort: "popular",
  },
];

export function MarketplaceHero({
  onSortChange,
  sortMode,
}: MarketplaceHeroProps) {
  return (
    <section
      aria-labelledby="marketplace-heading"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#edf2ff] via-[#e9f1ff] to-[#e2ecff] p-6 sm:p-8"
    >
      <div className="relative z-10 max-w-xl space-y-3">
        <Title
          id="marketplace-heading"
          level={1}
          className="!mb-0 !text-2xl !text-[#16215c] sm:!text-3xl"
        >
          发现企业内部 AI 应用
        </Title>
        <Text className="block text-sm text-[#4c5580] sm:text-base">
          统一查找、体验与共享各部门 AI 工具
        </Text>
        <div className="flex flex-wrap gap-3 pt-2">
          {quickLinks.map((link) => (
            <button
              aria-pressed={sortMode === link.sort}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                sortMode === link.sort
                  ? "border-[#1677ff] bg-[#e6f4ff] text-[#0958d9]"
                  : "border-transparent bg-white text-[#1f1f1f] hover:border-[#91caff]"
              }`}
              key={link.sort}
              onClick={() => onSortChange(link.sort)}
              type="button"
            >
              {link.icon}
              {link.label}
            </button>
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-72 lg:block"
      >
        <div className="absolute right-16 top-8 h-16 w-16 rounded-2xl bg-gradient-to-br from-[#3d6bff] to-[#7c9bff] opacity-90 shadow-lg" />
        <div className="absolute right-36 top-24 h-10 w-10 rounded-xl bg-gradient-to-br from-[#12b76a] to-[#5eead4] opacity-80 shadow-md" />
        <div className="absolute right-10 top-28 h-24 w-24 rounded-3xl bg-gradient-to-br from-[#7a5af8] to-[#b79cff] opacity-70 shadow-xl" />
        <div className="absolute bottom-6 right-24 h-12 w-12 rounded-2xl bg-gradient-to-br from-[#06aed4] to-[#67e8f9] opacity-80 shadow-md" />
      </div>
    </section>
  );
}
