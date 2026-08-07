import { Input, Spin, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyBlock } from "../../components/common/EmptyBlock";
import { ErrorBlock } from "../../components/common/ErrorBlock";
import { demandStatusText } from "../../modules/innovation/demandMeta";
import { useDemandList } from "../../modules/innovation/useDemand";

const { Paragraph, Title } = Typography;

export default function InnovationSquarePage() {
  const [query, setQuery] = useState("");
  const { data, error, isError, isPending, refetch } = useDemandList(query);

  return (
    <div className="space-y-6">
      <section aria-labelledby="innovation-demand-list" className="space-y-4">
        <Title id="innovation-demand-list" level={2} className="!mb-0">
          可见需求
        </Title>
        <Input.Search
          aria-label="搜索需求"
          enterButton="搜索"
          onSearch={setQuery}
          placeholder="搜索需求标题或描述"
        />
        {isPending ? <Spin aria-label="需求列表加载中" /> : null}
        {isError ? (
          <ErrorBlock
            description={error.message}
            onRetry={() => void refetch()}
            title="需求列表加载失败"
          />
        ) : null}
        {data && data.items.length === 0 ? (
          <EmptyBlock description="当前受众范围内没有可见需求" />
        ) : null}
        {data?.items.map((demand) => (
          <article
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
            key={demand.demandId}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Title level={3} className="!mb-1">
                  {demand.title}
                </Title>
                <Typography.Text type="secondary">
                  {demandStatusText[demand.status]} · {demand.likeCount} 个赞 ·{" "}
                  {demand.commentCount} 条补充讨论
                </Typography.Text>
              </div>
              {demand.displayAnonymously ? <Tag>匿名展示</Tag> : null}
            </div>
            <Paragraph className="!mb-3 !mt-3">
              {demand.problemStatement}
            </Paragraph>
            <Link to={`/innovation/${demand.demandId}`}>查看需求详情</Link>
          </article>
        ))}
      </section>
    </div>
  );
}
