import type { CatalogEntry } from "@ai-hub/contracts";
import { LikeOutlined, StarFilled } from "@ant-design/icons";
import { Tag, Typography } from "antd";
import { Link } from "react-router-dom";

import {
  channelText,
  formatCount,
  iconGradient,
  relativeUpdateText,
  trustLabelMeta,
} from "../../modules/marketplace/catalogMeta";

const { Paragraph, Text, Title } = Typography;

export interface AppCardProps {
  departmentName: string | undefined;
  entry: CatalogEntry;
}

export function AppCard({ departmentName, entry }: AppCardProps) {
  const detailPath = `/marketplace/${entry.applicationId}`;
  const channels = entry.deliveryChannels
    .map((channel) => channelText[channel])
    .join(" / ");

  return (
    <Link
      aria-label={`查看应用 ${entry.name}`}
      className="block h-full"
      to={detailPath}
    >
      <article className="flex h-full flex-col gap-2 rounded-xl bg-white p-3 shadow-sm transition-shadow hover:border-[#91caff] hover:shadow-md">
        <div className="flex items-top gap-3">
          <div
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm text-lg font-semibold text-white"
            style={{ background: iconGradient(entry.applicationId) }}
          >
            {entry.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <Title
              className="!mb-0 !mt-0 !truncate !text-base"
              level={5}
              ellipsis={{ rows: 1 }}
              title={entry.name}
            >
              {entry.name}
            </Title>
            <Paragraph
              className="!mb-0 !text-xs !text-[#999999]"
              ellipsis={{ rows: 2, tooltip: true }}
            >
              {entry.summary}
            </Paragraph>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {entry.trustLabels.map((label) => (
            <Tag
              className="!mr-0"
              color={trustLabelMeta[label].color}
              key={label}
            >
              {trustLabelMeta[label].text}
            </Tag>
          ))}
          <Tag className="!mr-0" color="geekblue">
            {entry.categoryName ?? entry.categoryId}
          </Tag>
        </div>
        <Text type="secondary" className="!text-xs">
          {channels} | {departmentName ?? entry.departmentId}{" "}
        </Text>

        <div className="mt-auto flex items-center justify-between gap-4">
          <span className="text-[#8c8c8c] !text-xs">
            {relativeUpdateText(entry.publishedAt)}
          </span>
          <div className="flex items-center gap-3 text-[#8c8c8c]">
            <span className="inline-flex items-center gap-1">
              <StarFilled aria-hidden="true" className="text-[#fcb824]" />
              <Text className="!text-xs">
                {entry.ratingAverage?.toFixed(1) ?? "暂无"}
              </Text>
            </span>
            <span className="inline-flex items-center gap-1 text-[#8c8c8c]">
              <LikeOutlined aria-hidden="true" />
              <Text className="!text-xs">{formatCount(entry.likeCount)}</Text>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
