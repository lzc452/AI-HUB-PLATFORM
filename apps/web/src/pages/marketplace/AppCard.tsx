import type { CatalogEntry } from "@ai-hub/contracts";
import { LikeOutlined, StarFilled } from "@ant-design/icons";
import { Button, Tag, Typography } from "antd";
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
    <article className="flex flex-col gap-3 rounded-xl border border-solid border-[#eef0f4] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white"
          style={{ background: iconGradient(entry.applicationId) }}
        >
          {entry.name.slice(0, 1)}
        </div>
        <Title level={3} className="!mb-0 !text-base">
          {entry.name}
        </Title>
      </div>
      <Paragraph className="!mb-0 line-clamp-2 min-h-10 text-sm text-[#595959]">
        {entry.summary}
      </Paragraph>
      <Text type="secondary" className="text-xs">
        {channels || "未配置交付"} ｜ {departmentName ?? entry.departmentId} ｜{" "}
        {relativeUpdateText(entry.publishedAt)}
      </Text>
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
          {entry.categoryId}
        </Tag>
        {entry.tagIds.slice(0, 2).map((tag) => (
          <Tag className="!mr-0" color="cyan" key={tag}>
            {tag}
          </Tag>
        ))}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1">
          <StarFilled aria-hidden="true" className="text-[#faad14]" />
          <Text strong>{entry.ratingAverage?.toFixed(1) ?? "暂无"}</Text>
        </span>
        <span className="inline-flex items-center gap-1 text-[#8c8c8c]">
          <LikeOutlined aria-hidden="true" />
          {formatCount(entry.likeCount)}
        </span>
      </div>
      <div className="mt-auto flex gap-2 pt-1">
        <Link className="flex-1" to={detailPath}>
          <Button block>查看详情</Button>
        </Link>
        <Link className="flex-1" to={detailPath}>
          <Button block type="primary">
            立即使用
          </Button>
        </Link>
      </div>
    </article>
  );
}
