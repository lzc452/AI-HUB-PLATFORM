import type { CatalogEntry } from "@ai-hub/contracts";
import { LikeOutlined, StarFilled, RightOutlined } from "@ant-design/icons";
import { Card, Empty as AntdEmpty, Tag, Typography } from "antd";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useDepartments } from "../../../modules/auth/useIdentity";
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
  return (
    <article className="flex items-center gap-3 bg-white transition-colors hover:border-[#91caff]">
      <Link
        aria-label={`查看应用 ${entry.name}`}
        className="flex min-w-0 flex-1 items-start gap-3 text-inherit"
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
              <Tag className="!mr-1" color="geekblue" key={channel}>
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
