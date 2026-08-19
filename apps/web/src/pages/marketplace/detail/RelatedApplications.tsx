import type { CatalogEntry } from "@ai-hub/contracts";
import { LikeOutlined, StarFilled, RightOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Empty as AntdEmpty,
  message,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../../../shared/api/client";
import { useDepartments } from "../../../modules/auth/useIdentity";
import {
  downloadDeliveryAsset,
  resolveDelivery,
  type DeliveryChannel,
} from "../../../modules/marketplace/marketplace.client";
import { useCatalogSearch } from "../../../modules/marketplace/useCatalog";
import {
  channelText,
  formatCount,
  iconGradient,
} from "../../../modules/marketplace/catalogMeta";

const { Text } = Typography;

export interface RelatedApplicationsProps {
  entry: CatalogEntry;
}

interface RelatedAppItemProps {
  departmentName: string | undefined;
  entry: CatalogEntry;
}

function RelatedAppItem({ departmentName, entry }: RelatedAppItemProps) {
  const [isPending, setIsPending] = useState(false);
  // web 交付入口 URL 缺失/非法（WEB_DELIVERY_URL_MISSING）时禁用"立即使用"。
  const [urlMissing, setUrlMissing] = useState(false);
  const deliveryChannel = entry.deliveryChannels[0] as
    | DeliveryChannel
    | undefined;
  const canResolveDelivery = entry.capabilities?.canResolveDelivery ?? false;

  const handleUse = async () => {
    if (!deliveryChannel || !canResolveDelivery || isPending || urlMissing) {
      return;
    }
    setIsPending(true);
    try {
      const result = await resolveDelivery(
        entry.applicationId,
        deliveryChannel,
      );
      if (result.kind === "web_redirect") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else if (result.kind === "download") {
        const { blob, fileName } = await downloadDeliveryAsset(
          entry.applicationId,
          deliveryChannel,
        );
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      } else if (result.kind === "qr") {
        message.info(result.payload);
      } else {
        message.warning(result.reason);
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "WEB_DELIVERY_URL_MISSING"
      ) {
        // 交付地址未配置/非法：禁用入口并提示，避免打开空白页。
        setUrlMissing(true);
        message.error("交付地址未配置");
      } else {
        message.error(error instanceof Error ? error.message : "交付解析失败");
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <article className="flex items-center gap-3 bg-white transition-colors hover:border-[#91caff]">
      <Link
        aria-label={`查看应用 ${entry.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-inherit"
        to={`/marketplace/${entry.applicationId}`}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white"
          style={{ background: iconGradient(entry.applicationId) }}
        >
          {entry.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Text strong className="!mb-0 truncate text-sm">
              {entry.name}
            </Text>
            <span className="text-xs text-[#8c8c8c]">
              {/* 显示右箭头 */}
              <RightOutlined />
            </span>
          </div>
          <div>
            {entry.deliveryChannels.map((channel) => (
              <Tag className="!mr-0" color="geekblue" key={channel}>
                {channelText[channel]}
              </Tag>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-[#8c8c8c]">
            <span className="inline-flex items-center gap-1">
              <StarFilled aria-hidden="true" className="text-[#faad14]" />
              {entry.ratingAverage?.toFixed(1) ?? "0.0"}
            </span>
            <span className="inline-flex items-center gap-1">
              <LikeOutlined aria-hidden="true" />
              {formatCount(entry.likeCount)}
            </span>
            <span className="truncate">
              {departmentName ?? entry.departmentId}
            </span>
          </div>
        </div>
      </Link>
      <Tooltip
        title={
          urlMissing
            ? "交付地址未配置"
            : canResolveDelivery
              ? `使用${channelText[deliveryChannel ?? "web"]}`
              : "当前角色无权交付或应用尚未配置可用渠道"
        }
      >
        {/* 禁用按钮不触发鼠标事件，包一层 span 让 Tooltip 在真实浏览器中可用。 */}
        <span>
          <Button
            disabled={!deliveryChannel || !canResolveDelivery || urlMissing}
            loading={isPending}
            onClick={handleUse}
            size="small"
            type="primary"
          >
            立即使用
          </Button>
        </span>
      </Tooltip>
    </article>
  );
}

/** 相关推荐：拉 5 条推荐，同 categoryId 优先 → 取 3 条。 */
export function RelatedApplications({ entry }: RelatedApplicationsProps) {
  const { data } = useCatalogSearch({
    categoryId: undefined,
    pageSize: 5,
    query: "",
    sort: "recommended",
  });
  const departments = useDepartments();

  const related = useMemo(() => {
    const items = data?.items ?? [];
    const others = items.filter(
      (item) => item.applicationId !== entry.applicationId,
    );
    const sameCategory = others.filter(
      (item) => item.categoryId === entry.categoryId,
    );
    const otherCategory = others.filter(
      (item) => item.categoryId !== entry.categoryId,
    );
    return [...sameCategory, ...otherCategory].slice(0, 3);
  }, [data, entry.applicationId, entry.categoryId]);

  const departmentNames = useMemo(
    () =>
      new Map(
        (departments.data ?? []).map((item) => [item.departmentId, item.name]),
      ),
    [departments.data],
  );

  return (
    <Card
      aria-labelledby="related-heading"
      className="rounded-2xl shadow-sm"
      title={
        <span id="related-heading" className="text-base">
          相关推荐
        </span>
      }
    >
      {related.length > 0 ? (
        <ul aria-label="相关应用列表" className="m-0 list-none space-y-3 p-0">
          {related.map((item) => (
            <li key={item.applicationId}>
              <RelatedAppItem
                departmentName={departmentNames.get(item.departmentId)}
                entry={item}
              />
            </li>
          ))}
        </ul>
      ) : (
        <AntdEmpty description="暂无相关推荐" imageStyle={{ height: 60 }} />
      )}
    </Card>
  );
}
