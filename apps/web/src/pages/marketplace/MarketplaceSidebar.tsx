import type { CatalogEntry } from "@ai-hub/contracts";
import {
  QuestionCircleOutlined,
  ReadOutlined,
  RightOutlined,
  StarFilled,
} from "@ant-design/icons";
import { Tag, Typography } from "antd";
import { Link } from "react-router-dom";

import { useCatalogSearch } from "../../modules/marketplace/useCatalog";
import {
  iconGradient,
  relativeUpdateText,
} from "../../modules/marketplace/catalogMeta";

const { Text, Title } = Typography;

const tagChipColors = [
  "magenta",
  "geekblue",
  "cyan",
  "green",
  "purple",
  "gold",
] as const;

const guideItems = [
  { icon: ReadOutlined, text: "如何快速找到合适的应用？" },
  { icon: ReadOutlined, text: "应用使用与权限说明" },
  { icon: QuestionCircleOutlined, text: "如何申请发布应用？" },
  { icon: QuestionCircleOutlined, text: "常见问题解答" },
] as const;

export interface MarketplaceSidebarProps {
  departmentNames: Map<string, string>;
  items: CatalogEntry[];
}

export function MarketplaceSidebar({
  departmentNames,
  items,
}: MarketplaceSidebarProps) {
  const latest = useCatalogSearch({ pageSize: 5, query: "", sort: "latest" });

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
        aria-labelledby="hot-tags-heading"
        className="rounded-xl border border-solid border-[#eef0f4] bg-white p-5 shadow-sm"
      >
        <Title id="hot-tags-heading" level={2} className="!mb-3 !text-base">
          热门标签
        </Title>
        {topTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topTags.map(([tag, count], index) => (
              <Tag
                className="!mr-0"
                color={tagChipColors[index % tagChipColors.length] ?? "default"}
                key={tag}
              >
                {tag} {count}
              </Tag>
            ))}
          </div>
        ) : (
          <Text type="secondary">暂无标签</Text>
        )}
      </section>
      <section
        aria-labelledby="recent-updates-heading"
        className="rounded-xl border border-solid border-[#eef0f4] bg-white p-5 shadow-sm"
      >
        <Title id="recent-updates-heading" level={2} className="!mb-3 !text-base">
          最近更新
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
      <section
        aria-labelledby="guide-heading"
        className="rounded-xl border border-solid border-[#eef0f4] bg-white p-5 shadow-sm"
      >
        <Title id="guide-heading" level={2} className="!mb-3 !text-base">
          使用指南
        </Title>
        <ul className="m-0 list-none divide-y divide-[#f2f3f7] p-0">
          {guideItems.map((item) => (
            <li
              className="flex items-center gap-2 py-2.5 text-sm text-[#4c5580]"
              key={item.text}
            >
              <item.icon aria-hidden="true" className="text-[#1677ff]" />
              <span className="flex-1">{item.text}</span>
              <RightOutlined aria-hidden="true" className="text-[#c0c4d6]" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
