import type { DeliveryChannel } from "@ai-hub/contracts";
import { DownOutlined } from "@ant-design/icons";
import { Alert, Button, Skeleton, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useDepartments } from "../../modules/auth/useIdentity";
import { useCatalogSearch } from "../../modules/marketplace/useCatalog";
import { AppCard } from "./AppCard";
import { MarketplaceFilters } from "./MarketplaceFilters";
import {
  MarketplaceHero,
  type MarketplaceSortMode,
} from "./MarketplaceHero";
import { MarketplaceSidebar } from "./MarketplaceSidebar";

const { Paragraph, Text, Title } = Typography;

const PAGE_SIZE_STEP = 12;

export default function MarketplacePage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [sortMode, setSortMode] = useState<MarketplaceSortMode>("recommended");
  const [categoryId, setCategoryId] = useState<string>();
  const [channel, setChannel] = useState<DeliveryChannel>();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState<string>();
  const [pageSize, setPageSize] = useState(PAGE_SIZE_STEP);

  useEffect(() => {
    setPageSize(PAGE_SIZE_STEP);
  }, [query, sortMode, categoryId, channel, departmentId]);

  const { data, error, isError, isPending, refetch } = useCatalogSearch({
    categoryId,
    pageSize,
    query,
    sort: sortMode,
  });
  const departments = useDepartments();

  const departmentNames = useMemo(
    () =>
      new Map(
        (departments.data ?? []).map((item) => [item.departmentId, item.name]),
      ),
    [departments.data],
  );

  const categoryOptions = useMemo(
    () => [...new Set((data?.items ?? []).map((item) => item.categoryId))],
    [data],
  );
  const tagOptions = useMemo(
    () => [...new Set((data?.items ?? []).flatMap((item) => item.tagIds))],
    [data],
  );

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (channel) {
      list = list.filter((entry) => entry.deliveryChannels.includes(channel));
    }
    if (tagIds.length > 0) {
      list = list.filter((entry) =>
        tagIds.every((tagId) => entry.tagIds.includes(tagId)),
      );
    }
    if (departmentId) {
      list = list.filter((entry) => entry.departmentId === departmentId);
    }
    return list;
  }, [channel, data, departmentId, tagIds]);

  const resetFilters = () => {
    setCategoryId(undefined);
    setChannel(undefined);
    setDepartmentId(undefined);
    setTagIds([]);
  };

  const toggleTag = (tagId: string) => {
    setTagIds((current) =>
      current.includes(tagId)
        ? current.filter((value) => value !== tagId)
        : [...current, tagId],
    );
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="marketplace-heading" className="space-y-2">
        <Title id="marketplace-heading" level={1} className="!mb-0">
          应用市场
        </Title>
        <Paragraph className="!mb-0 text-[#595959]">
          统一查找、体验与分享各部门 AI 工具
        </Paragraph>
      </section>
      <MarketplaceHero onSortChange={setSortMode} sortMode={sortMode} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <MarketplaceFilters
            categoryId={categoryId}
            categoryOptions={categoryOptions}
            channel={channel}
            departmentId={departmentId}
            departmentOptions={(departments.data ?? []).map((item) => ({
              label: item.name,
              value: item.departmentId,
            }))}
            onCategoryChange={setCategoryId}
            onChannelChange={setChannel}
            onDepartmentChange={setDepartmentId}
            onReset={resetFilters}
            onTagChange={setTagIds}
            tagIds={tagIds}
            tagOptions={tagOptions}
          />
          <section
            aria-labelledby="market-results-heading"
            className="space-y-4"
          >
            <div className="flex items-baseline justify-between">
              <Text strong id="market-results-heading">
                全部应用
              </Text>
              {data ? (
                <Text type="secondary" className="text-xs">
                  共 {items.length} 个应用
                </Text>
              ) : null}
            </div>
            {isPending ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5"
                    key={index}
                  >
                    <Skeleton active paragraph={{ rows: 4 }} />
                  </div>
                ))}
              </div>
            ) : null}
            {isError ? (
              <Alert
                action={
                  <Button onClick={() => void refetch()} size="small">
                    重试
                  </Button>
                }
                description={error.message}
                showIcon
                title="应用列表加载失败"
                type="error"
              />
            ) : null}
            {data && items.length === 0 ? (
              <div className="py-8">
                <Typography.Text type="secondary">
                  没有符合条件的已发布应用
                </Typography.Text>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((entry) => (
                <AppCard
                  departmentName={departmentNames.get(entry.departmentId)}
                  entry={entry}
                  key={entry.applicationId}
                />
              ))}
            </div>
            {data && items.length < data.total ? (
              <div className="flex justify-center">
                <Button
                  icon={<DownOutlined aria-hidden="true" />}
                  onClick={() =>
                    setPageSize((current) => current + PAGE_SIZE_STEP)
                  }
                  type="text"
                >
                  加载更多
                </Button>
              </div>
            ) : null}
            {data && data.total > 0 && items.length >= data.total ? (
              <div className="text-center text-sm text-[#595959]">
                已展示全部 {data.total} 个应用
              </div>
            ) : null}
          </section>
        </div>
        <MarketplaceSidebar
          departmentNames={departmentNames}
          items={data?.items ?? []}
          onTagSelect={toggleTag}
        />
      </div>
    </div>
  );
}
