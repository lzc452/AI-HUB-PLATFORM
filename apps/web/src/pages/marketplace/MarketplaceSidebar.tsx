import type { CatalogEntry } from "@ai-hub/contracts";
import { StarFilled } from "@ant-design/icons";
import { Tag, Typography } from "antd";
import { Link } from "react-router-dom";

import {
  iconGradient,
  relativeUpdateText,
} from "../../modules/marketplace/catalogMeta";
import { useCatalogSearch } from "../../modules/marketplace/useCatalog";

const { Text, Title } = Typography;

const tagChipColors = [
  "magenta",
  "geekblue",
  "cyan",
  "green",
  "purple",
  "gold",
] as const;

export interface MarketplaceSidebarProps {
  departmentNames: Map<string, string>;
  items: CatalogEntry[];
  onTagSelect: (tagId: string) => void;
}

export function MarketplaceSidebar({
  departmentNames,
  items,
  onTagSelect,
}: MarketplaceSidebarProps) {
  const latest = useCatalogSearch({ pageSize: 5, query: "", sort: "latest" });

  const recommended = items
    .filter((item) => item.trustLabels.includes("recommended"))
    .slice(0, 5);

  const tagCounts = new Map<string, number>();
  for (const item of items) {
    for (const tagId of item.tagIds) {
      tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="recommended-heading"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5 shadow-sm"
      >
        <Title id="recommended-heading" level={2} className="!mb-3 !text-base">
          管理员推荐
        </Title>
        {recommended.length > 0 ? (
          <ul className="m-0 list-none space-y-3 p-0">
            {recommended.map((entry) => (
              <li key={entry.applicationId}>
                <Link
                  className="flex items-center gap-3 rounded-md text-inherit hover:bg-[#f5f8ff]"
                  to={`/marketplace/${entry.applicationId}`}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ background: iconGradient(entry.applicationId) }}
                  >
                    {entry.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#1f1f1f]">
                      {entry.name}
                    </span>
                    <span className="block truncate text-xs text-[#8c8c8c]">
                      {departmentNames.get(entry.departmentId) ??
                        entry.departmentId}
                    </span>
                  </span>
                  <StarFilled
                    aria-hidden="true"
                    className="shrink-0 text-[#faad14]"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Text type="secondary">暂无推荐</Text>
        )}
      </section>
      <section
        aria-labelledby="hot-tags-heading"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5 shadow-sm"
      >
        <Title id="hot-tags-heading" level={2} className="!mb-3 !text-base">
          热门标签
        </Title>
        {topTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topTags.map(([tag, count], index) => (
              <button
                aria-label={`按标签 ${tag} 筛选`}
                className="cursor-pointer border-0 bg-transparent p-0"
                key={tag}
                onClick={() => onTagSelect(tag)}
                type="button"
              >
                <Tag
                  className="!mr-0 hover:border-[#91caff]"
                  color={tagChipColors[index % tagChipColors.length] ?? "default"}
                >
                  {tag} {count}
                </Tag>
              </button>
            ))}
          </div>
        ) : (
          <Text type="secondary">暂无标签</Text>
        )}
      </section>
      <section
        aria-labelledby="recent-updates-heading"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5 shadow-sm"
      >
        <Title
          id="recent-updates-heading"
          level={2}
          className="!mb-3 !text-base"
        >
          最新上架
        </Title>
        {latest.data && latest.data.items.length > 0 ? (
          <ul className="m-0 list-none space-y-3 p-0">
            {latest.data.items.map((entry) => (
              <li key={entry.applicationId}>
                <Link
                  className="flex items-center gap-3 rounded-md text-inherit hover:bg-[#f5f8ff]"
                  to={`/marketplace/${entry.applicationId}`}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ background: iconGradient(entry.applicationId) }}
                  >
                    {entry.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#1f1f1f]">
                      {entry.name}
                    </span>
                    <span className="block truncate text-xs text-[#8c8c8c]">
                      {departmentNames.get(entry.departmentId) ??
                        entry.departmentId}{" "}
                      ｜ {relativeUpdateText(entry.publishedAt)}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm">
                    <StarFilled aria-hidden="true" className="text-[#faad14]" />
                    {entry.ratingAverage?.toFixed(1) ?? "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Text type="secondary">暂无更新</Text>
        )}
      </section>
    </div>
  );
}
