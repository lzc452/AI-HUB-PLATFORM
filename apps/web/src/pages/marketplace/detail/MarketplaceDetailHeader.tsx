import type { CatalogEntry } from "@ai-hub/contracts";
import { LikeFilled, LikeOutlined, StarFilled } from "@ant-design/icons";
import { Button, Dropdown, Rate, Switch, Tag, Tooltip, Typography } from "antd";
import { useState } from "react";

import { useDepartments } from "../../../modules/auth/useIdentity";
import type { DeliveryChannel } from "../../../modules/marketplace/marketplace.client";
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
  onLike: () => void;
  onRate: (stars: number, displayAnonymously: boolean) => void;
  onResolve: (channel: DeliveryChannel) => void;
  resolving: boolean;
  ratingDisabled: boolean;
  ratingPending: boolean;
  likePending: boolean;
  /** web 交付入口 URL 缺失/非法（WEB_DELIVERY_URL_MISSING）时禁用"立即使用"。 */
  deliveryUrlMissing?: boolean;
  /** 当前用户评分（1-5）；未评分时为 null/0。 */
  myRating?: number | null;
  /** 当前用户是否已点赞。 */
  likedByMe: boolean;
}

/** 顶部 Header 区：图标 + 应用名 + 信任标签 + 元信息行 + 立即使用/收藏。 */
export function MarketplaceDetailHeader({
  entry,
  likedByMe,
  likePending,
  onLike,
  onRate,
  onResolve,
  resolving,
  ratingDisabled,
  ratingPending,
  myRating = 0,
  deliveryUrlMissing = false,
}: MarketplaceDetailHeaderProps) {
  const [anonymousRating, setAnonymousRating] = useState(false);
  const departments = useDepartments();
  const departmentName = departments.data?.find(
    (item) => item.departmentId === entry.departmentId,
  )?.name;

  const departmentLabel = departmentName ?? entry.departmentId;
  const ownerName = deriveOwner(entry);
  const ratingLabel = entry.ratingAverage?.toFixed(1) ?? "暂无";
  const primaryChannel: DeliveryChannel | undefined = entry.deliveryChannels[0];

  return (
    <header
      aria-label="应用详情头部"
      className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
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
                <span>{buildRatingCountLabel(entry)}</span>
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
        <section
          aria-label="应用操作"
          className="flex flex-col gap-2 md:items-end"
        >
          <section
            aria-label="应用互动"
            className="flex flex-wrap items-center gap-4"
          >
            <Button
              aria-label="点赞应用"
              icon={
                likedByMe ? (
                  <LikeFilled aria-hidden="true" />
                ) : (
                  <LikeOutlined aria-hidden="true" />
                )
              }
              loading={likePending}
              onClick={onLike}
              type={likedByMe ? "primary" : "default"}
            >
              {likedByMe ? "已赞" : "点赞"}
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
                aria-label="为应用评分"
                disabled={ratingDisabled}
                onChange={(stars) => onRate(stars, anonymousRating)}
                value={ratingPending ? 0 : (myRating ?? 0)}
              />
              <label className="inline-flex cursor-pointer items-center gap-1">
                <Switch
                  checked={anonymousRating}
                  onChange={setAnonymousRating}
                  size="small"
                />
                <span className="text-xs text-[#8c8c8c]">匿名评分</span>
              </label>
            </span>
          </section>

          <div className="flex shrink-0 gap-2">
            {deliveryUrlMissing ? (
              <Tooltip title="交付地址未配置">
                <span>
                  <Button disabled type="primary">
                    {primaryChannel !== undefined
                      ? `立即使用（${channelText[primaryChannel]}）`
                      : "立即使用"}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Dropdown
                menu={{
                  items: entry.deliveryChannels.map((channel) => ({
                    key: channel,
                    label: (
                      <span onClick={() => onResolve(channel)} role="menuitem">
                        {channelText[channel]}
                      </span>
                    ),
                  })),
                }}
                trigger={["click"]}
              >
                <Button loading={resolving} type="primary">
                  {primaryChannel !== undefined
                    ? `立即使用（${channelText[primaryChannel]}）`
                    : "立即使用"}
                </Button>
              </Dropdown>
            )}
            {/* <Tooltip title="收藏功能待接入">
              <Button
                aria-label="收藏"
                disabled
                icon={<StarOutlined aria-hidden="true" />}
              >
                收藏
              </Button>
            </Tooltip> */}
          </div>
        </section>
      </div>
    </header>
  );
}
