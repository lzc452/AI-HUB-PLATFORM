import type { CatalogSort, TrustLabel } from "@ai-hub/contracts";
import { Alert, Empty, Input, Spin, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useCatalogSearch } from "../../modules/marketplace/useCatalog";

const { Paragraph, Text, Title } = Typography;

const sortOptions: ReadonlyArray<{ label: string; value: CatalogSort }> = [
  { label: "管理员推荐", value: "recommended" },
  { label: "最新上架", value: "latest" },
  { label: "热门应用", value: "popular" },
];

const trustLabelText: Record<TrustLabel, string> = {
  deprecated: "即将废弃",
  experimental: "实验性",
  recommended: "官方推荐",
  verified: "已验证",
};

const trustLabelColor: Record<TrustLabel, string> = {
  deprecated: "warning",
  experimental: "default",
  recommended: "blue",
  verified: "success",
};

export default function MarketplacePage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CatalogSort>("recommended");
  const { data, error, isError, isPending } = useCatalogSearch({ query, sort });

  return (
    <div className="space-y-6">
      <section aria-labelledby="marketplace-heading" className="space-y-3">
        <Text type="secondary">Phase 4 / Permission-filtered catalog</Text>
        <Title id="marketplace-heading" level={1} className="!mb-0">
          应用市场
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          只展示当前员工有权访问的已发布应用，排序采用固定运营规则。
        </Paragraph>
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <section className="space-y-4" aria-labelledby="market-results-heading">
          <Title id="market-results-heading" level={2} className="!mb-0">
            应用列表
          </Title>
          <Input.Search
            aria-label="搜索应用"
            enterButton="搜索"
            onSearch={setQuery}
            placeholder="搜索应用名称、简介、拼音或首字母"
          />
          <div className="flex flex-wrap gap-2" aria-label="应用市场排序">
            {sortOptions.map((option) => (
              <Tag.CheckableTag
                checked={sort === option.value}
                key={option.value}
                onChange={() => setSort(option.value)}
              >
                {option.label}
              </Tag.CheckableTag>
            ))}
          </div>
          {isPending ? <Spin aria-label="应用列表加载中" /> : null}
          {isError ? (
            <Alert
              description={error.message}
              showIcon
              title="应用列表加载失败"
              type="error"
            />
          ) : null}
          {data && data.items.length === 0 ? (
            <Empty description="没有符合条件的已发布应用" />
          ) : null}
          {data?.items.map((entry) => (
            <article
              className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
              key={entry.applicationId}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Title level={3} className="!mb-1">
                    {entry.name}
                  </Title>
                  <Text type="secondary">
                    {entry.categoryId} · {entry.likeCount} 次点赞 ·{" "}
                    {entry.ratingAverage ?? "暂无"} 分
                  </Text>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.trustLabels.map((label) => (
                    <Tag color={trustLabelColor[label]} key={label}>
                      {trustLabelText[label]}
                    </Tag>
                  ))}
                </div>
              </div>
              <Paragraph className="!mb-3 !mt-3">{entry.summary}</Paragraph>
              <Link to={`/marketplace/${entry.applicationId}`}>
                查看应用详情与交付入口
              </Link>
            </article>
          ))}
        </section>
        <aside
          className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
          aria-label="应用市场状态"
        >
          <Title level={3} className="!mb-3">
            市场状态
          </Title>
          <div className="space-y-3 text-sm">
            <p className="m-0">
              <Tag color="success">已验证</Tag> 已通过自动校验和人工审核
            </p>
            <p className="m-0">
              <Tag color="warning">即将废弃</Tag> 显示替代应用和说明
            </p>
            <p className="m-0 text-[#595959]">
              无权限的应用不会出现在列表、搜索或详情中。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
