import type { DeliveryChannel } from "@ai-hub/contracts";
import { DownOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Input, Spin, Typography } from "antd";
import { useMemo, useState } from "react";

import { useDepartments } from "../../modules/auth/useIdentity";
import { useCatalogSearch } from "../../modules/marketplace/useCatalog";
import { AppCard } from "./AppCard";
import {
  MarketplaceFilters,
} from "./MarketplaceFilters";
import {
  MarketplaceHero,
  type MarketplaceSortMode,
} from "./MarketplaceHero";
import { MarketplaceSidebar } from "./MarketplaceSidebar";

const { Text } = Typography;

const PAGE_SIZE_STEP = 12;

export default function MarketplacePage() {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<MarketplaceSortMode>("recommended");
  const [categoryId, setCategoryId] = useState<string>();
  const [channel, setChannel] = useState<DeliveryChannel>();
  const [tagId, setTagId] = useState<string>();
  const [departmentId, setDepartmentId] = useState<string>();
  const [pageSize, setPageSize] = useState(PAGE_SIZE_STEP);

  const serverSort = sortMode === "rating" ? "recommended" : sortMode;
  const { data, error, isError, isPending } = useCatalogSearch({
    categoryId,
    pageSize,
    query,
    sort: serverSort,
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
    () => [
      ...new Set((data?.items ?? []).flatMap((item) => item.tagIds)),
    ],
    [data],
  );

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (channel) {
      list = list.filter((entry) => entry.deliveryChannels.includes(channel));
    }
    if (tagId) {
      list = list.filter((entry) => entry.tagIds.includes(tagId));
    }
    if (departmentId) {
      list = list.filter((entry) => entry.departmentId === departmentId);
    }
    if (sortMode === "rating") {
      list = [...list].sort(
        (a, b) => (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0),
      );
    }
    return list;
  }, [channel, data, departmentId, sortMode, tagId]);

  const resetFilters = () => {
    setCategoryId(undefined);
    setChannel(undefined);
    setDepartmentId(undefined);
    setTagId(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-xl">
        <Input.Search
          allowClear
          aria-label="搜索应用"
          enterButton="搜索"
          onSearch={(value) => {
            setQuery(value);
            setPageSize(PAGE_SIZE_STEP);
          }}
          placeholder="搜索应用 / 标签 / 场景"
          size="large"
        />
      </div>
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
            onSortModeChange={setSortMode}
            onTagChange={setTagId}
            sortMode={sortMode}
            tagId={tagId}
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
              <div className="flex justify-center py-12">
                <Spin aria-label="应用列表加载中" />
              </div>
            ) : null}
            {isError ? (
              <Alert
                description={error.message}
                showIcon
                title="应用列表加载失败"
                type="error"
              />
            ) : null}
            {data && items.length === 0 ? (
              <Empty description="没有符合条件的已发布应用" />
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
          </section>
        </div>
        <MarketplaceSidebar
          departmentNames={departmentNames}
          items={data?.items ?? []}
        />
      </div>
    </div>
  );
}
