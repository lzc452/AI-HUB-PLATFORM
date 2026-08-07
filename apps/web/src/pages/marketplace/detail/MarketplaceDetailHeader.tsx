import type { CatalogEntry } from "@ai-hub/contracts";
import { LikeOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { Alert, Button, Rate, Tag, Tooltip, Typography } from "antd";

import { useDepartments } from "../../../modules/auth/useIdentity";
import {
  channelText,
  formatCount,
  iconGradient,
  trustLabelMeta,
} from "../../../modules/marketplace/catalogMeta";
import {
  buildRatingCountLabel,
  deriveOwner,
} from "../../../modules/marketplace/detailContent";

const { Text, Title } = Typography;

export interface MarketplaceDetailHeaderProps {
  entry: CatalogEntry;
  interactionError: boolean;
  onLike: () => void;
  onRate: (stars: number) => void;
  ratingDisabled: boolean;
  ratingPending: boolean;
  likePending: boolean;
}

/** 顶部 Header 区：图标 + 应用名 + 信任标签 + 元信息行 + 立即使用/收藏。 */
export function MarketplaceDetailHeader({
  entry,
  interactionError,
  likePending,
  onLike,
  onRate,
  ratingDisabled,
  ratingPending,
}: MarketplaceDetailHeaderProps) {
  const departments = useDepartments();
  const departmentName = departments.data?.find(
    (item) => item.departmentId === entry.departmentId,
  )?.name;

  const departmentLabel = departmentName ?? entry.departmentId;
  const ownerName = deriveOwner(entry.applicationId);
  const ratingLabel = entry.ratingAverage?.toFixed(1) ?? "暂无";

  return (
    <header
      aria-label="应用详情头部"
      className="rounded-2xl border border-[#d9d9d9] bg-white p-5 shadow-sm md:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-semibold text-white"
            style={{ background: iconGradient(entry.applicationId) }}
          >
            {entry.name.slice(0, 1)}
          </div>
          <div className="min-w-0 space-y-2">
            <Title id="application-title" level={1} className="!mb-0 !text-2xl">
              {entry.name}
            </Title>
            <div className="flex flex-wrap items-center gap-1.5">
              {entry.trustLabels.map((label) => (
                <Tag
                  className="!mr-0"
                  color={trustLabelMeta[label].color}
                  key={label}
                >
                  {trustLabelMeta[label].text}
                </Tag>
              ))}
              {entry.deliveryChannels.map((channel) => (
                <Tag className="!mr-0" color="geekblue" key={channel}>
                  {channelText[channel]}
                </Tag>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#595959]">
              <span className="inline-flex items-center gap-1">
                <StarFilled aria-hidden="true" className="text-[#faad14]" />
                <Text strong className="!text-[#1f1f1f]">
                  {ratingLabel}
                </Text>
                <span>{buildRatingCountLabel(entry.likeCount)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <LikeOutlined aria-hidden="true" />
                {formatCount(entry.likeCount)}
              </span>
              <span>
                所属部门：
                <Text strong className="!text-[#1f1f1f]">
                  {departmentLabel}
                </Text>
              </span>
              <span>
                责任人：
                <Text strong className="!text-[#1f1f1f]">
                  {ownerName}（{departmentLabel}）
                </Text>
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Tooltip title="交付动作接口待接入">
            <Button disabled type="primary">
              立即使用
            </Button>
          </Tooltip>
          <Tooltip title="收藏功能待接入">
            <Button
              aria-label="收藏"
              disabled
              icon={<StarOutlined aria-hidden="true" />}
            >
              收藏
            </Button>
          </Tooltip>
        </div>
      </div>

      <section
        aria-label="应用互动"
        className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-[#f0f0f0] bg-[#fafafa] px-4 py-3"
      >
        <Button
          aria-label="点赞应用"
          icon={<LikeOutlined aria-hidden="true" />}
          loading={likePending}
          onClick={onLike}
        >
          点赞（{entry.likeCount}）
        </Button>
        <span className="text-sm text-[#595959]">
          综合评分：
          <Text strong className="!text-[#1f1f1f]">
            {ratingLabel}
          </Text>
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-[#595959]">
          我的评分：
          <Rate
            allowHalf
            aria-label="为应用评分"
            disabled={ratingDisabled}
            onChange={(stars) => onRate(stars)}
            {...(ratingPending ? { value: 0 } : {})}
          />
        </span>
        {interactionError ? (
          <Alert
            className="!mb-0"
            message="互动操作失败，请稍后重试"
            showIcon
            type="error"
          />
        ) : null}
      </section>
    </header>
  );
}