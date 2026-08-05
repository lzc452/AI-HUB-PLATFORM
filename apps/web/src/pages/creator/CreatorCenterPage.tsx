import { Alert, Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { useCreatorSummary } from "../../modules/application/useApplication";

const { Paragraph, Text, Title } = Typography;

export default function CreatorCenterPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } = useCreatorSummary(applicationId);

  return (
    <div className="space-y-6">
      <section aria-labelledby="creator-heading" className="space-y-3">
        <Text type="secondary">Phase 4 / Creator center</Text>
        <Title id="creator-heading" level={1} className="!mb-0">
          创作者中心
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          查看版本差异、自动校验报告和单应用聚合数据，不展示个人访问名单。
        </Paragraph>
      </section>
      {isPending ? <Spin aria-label="创作者数据加载中" /> : null}
      {isError ? (
        <Alert
          description={error.message}
          showIcon
          title="创作者数据加载失败"
          type="error"
        />
      ) : null}
      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
              <Text type="secondary">交付动作</Text>
              <Title level={2} className="!mb-0 !mt-2">
                {data.metrics.redirectCount +
                  data.metrics.downloadCount +
                  data.metrics.qrDisplayCount}
              </Title>
            </div>
            <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
              <Text type="secondary">点赞</Text>
              <Title level={2} className="!mb-0 !mt-2">
                {data.metrics.likeCount}
              </Title>
            </div>
            <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
              <Text type="secondary">评分</Text>
              <Title level={2} className="!mb-0 !mt-2">
                {data.metrics.ratingAverage ?? "暂无"}
              </Title>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
              <Title level={3} className="!mb-3">
                版本差异
              </Title>
              <Paragraph>
                {data.versionDiff.fromVersion} → {data.versionDiff.toVersion}
              </Paragraph>
              <div className="flex flex-wrap gap-2">
                {data.versionDiff.changedFields.map((field) => (
                  <Tag key={field}>{field}</Tag>
                ))}
              </div>
            </section>
            <section className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
              <Title level={3} className="!mb-3">
                自动校验报告
              </Title>
              <Tag
                color={
                  data.validationReport.status === "passed"
                    ? "success"
                    : "error"
                }
              >
                {data.validationReport.status === "passed"
                  ? "校验通过"
                  : "校验失败"}
              </Tag>
              <ul className="m-0 mt-3 space-y-2 pl-5">
                {data.validationReport.checks.map((check) => (
                  <li key={check.name}>
                    {check.name}：
                    {check.status === "passed" ? "通过" : "失败"}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
