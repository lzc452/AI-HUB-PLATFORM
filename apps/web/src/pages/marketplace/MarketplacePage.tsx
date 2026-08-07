import type { DeliveryChannel } from "@ai-hub/contracts";
import { Alert, Button, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { EmptyBlock } from "../../components/common/EmptyBlock";
import { SkeletonCard } from "../../components/common/SkeletonCard";
import { useDepartments } from "../../modules/auth/useIdentity";
import { useCatalogSearch } from "../../modules/marketplace/useCatalog";
import { AppCard } from "./AppCard";
import { MarketplaceFilters } from "./MarketplaceFilters";
import { MarketplaceHero, type MarketplaceSortMode } from "./MarketplaceHero";

const { Paragraph } = Typography;

const PAGE_SIZE = 6;

export default function MarketplacePage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [sortMode, setSortMode] = useState<MarketplaceSortMode>("recommended");
  const [categoryId, setCategoryId] = useState<string>();
  const [channel, setChannel] = useState<DeliveryChannel>();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState<string>();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query, sortMode, categoryId, channel, departmentId, tagIds]);

  const serverSort = sortMode === "rating" ? "popular" : sortMode;

  const { data, error, isError, isPending, refetch } = useCatalogSearch({
    categoryId,
    page,
    pageSize: PAGE_SIZE,
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
    () => [...new Set((data?.items ?? []).flatMap((item) => item.tagIds))],
    [data],
  );

  const filteredItems = useMemo(() => {
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

  const sortedItems = useMemo(() => {
    if (sortMode !== "rating") return filteredItems;
    return [...filteredItems].sort(
      (a, b) => (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0),
    );
  }, [filteredItems, sortMode]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setCategoryId(undefined);
    setChannel(undefined);
    setDepartmentId(undefined);
    setTagIds([]);
  };

  return (
    <div className="space-y-4">
      <section
        aria-label="应用市场欢迎"
        className="flex items-center justify-between gap-6 rounded-2xl border border-[#d6e4ff] bg-gradient-to-br from-[#e6f4ff] via-[#f0f7ff] to-[#fafcff] p-6 lg:p-8"
      >
        <div className="min-w-0 space-y-2">
          <Typography.Title level={1} className="!mb-0 !text-2xl lg:!text-3xl">
            发现企业内部 AI 应用
          </Typography.Title>
          <Paragraph className="!mb-0 text-sm text-[#595959] lg:text-base">
            统一查找、体验与分享各部门 AI 工具
          </Paragraph>
        </div>
        <div
          aria-hidden="true"
          className="hidden h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-[#3d6bff] to-[#7c9bff] opacity-30 shadow-inner md:block lg:h-32 lg:w-32"
        />
      </section>

      <div className='bg-white p-2 lg:p-4 rounded-xl space-y-4'>
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

        <MarketplaceHero
          onPageChange={setPage}
          onSortChange={setSortMode}
          total={total}
          page={page}
          pageCount={pageCount}
          sortMode={sortMode}
        />

        <section aria-labelledby="market-results-heading" className="space-y-4">
          {isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SkeletonCard count={6} />
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
          {data && sortedItems.length === 0 ? (
            <EmptyBlock description="没有符合条件的已发布应用" />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {sortedItems.map((entry) => (
              <AppCard
                departmentName={departmentNames.get(entry.departmentId)}
                entry={entry}
                key={entry.applicationId}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
