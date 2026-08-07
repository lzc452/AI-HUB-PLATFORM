import {
  AppstoreOutlined,
  FileTextOutlined,
  LikeOutlined,
  StarFilled,
} from "@ant-design/icons";
import { Alert, Button, Skeleton, Tag, Typography } from "antd";
import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { KpiCard } from "../../components/common/KpiCard";
import { PageHeader } from "../../components/common/PageHeader";
import {
  useCreatorApplications,
  useCreatorSummary,
} from "../../modules/application/useApplication";
import { formatCount } from "../../modules/marketplace/catalogMeta";
import { CreatorAppTable } from "./CreatorAppTable";
import { CreatorSidebar } from "./CreatorSidebar";
import { CreatorTrendChart } from "./CreatorTrendChart";
import { CreatorWelcomeBanner } from "./CreatorWelcomeBanner";

const { Paragraph, Title } = Typography;

export default function CreatorCenterPage() {
  const { applicationId } = useParams();
  const applications = useCreatorApplications();
  const summary = useCreatorSummary(applicationId);

  const publishedCount = useMemo(
    () =>
      (applications.data?.items ?? []).filter(
        (item) => item.status === "published",
      ).length,
    [applications.data],
  );
  const inReviewCount = useMemo(
    () =>
      (applications.data?.items ?? []).filter(
        (item) => item.status === "in_review",
      ).length,
    [applications.data],
  );
  const totalLikes = useMemo(
    () =>
      (applications.data?.items ?? []).reduce(
        (sum, item) => sum + item.likeCount,
        0,
      ),
    [applications.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        description="统一查看应用发布状态、运营指标与使用趋势，管理您创作的 AI 应用。"
        title="创作者中心"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <CreatorWelcomeBanner />

          <section aria-label="创作者核心指标" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={
                  <AppstoreOutlined
                    aria-hidden="true"
                    className="text-[#1677ff]"
                  />
                }
                label="总发布应用"
                value={publishedCount}
              />
              <KpiCard
                icon={
                  <LikeOutlined aria-hidden="true" className="text-[#52c41a]" />
                }
                label="累计点赞"
                value={formatCount(totalLikes)}
              />
              <KpiCard
                icon={
                  <StarFilled aria-hidden="true" className="text-[#faad14]" />
                }
                label="平均评分"
                value={summary.data?.metrics.ratingAverage ?? "—"}
              />
              <KpiCard
                icon={
                  <FileTextOutlined
                    aria-hidden="true"
                    className="text-[#f79009]"
                  />
                }
                label="待审校核应用"
                value={inReviewCount}
              />
            </div>
          </section>

          <CreatorAppTable
            data={applications.data}
            error={applications.error}
            isError={applications.isError}
            isPending={applications.isPending}
            refetch={() => void applications.refetch()}
          />

          <CreatorTrendChart />

          {applicationId && summary.isPending ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : null}
          {applicationId && summary.isError ? (
            <Alert
              action={
                <Button onClick={() => void summary.refetch()} size="small">
                  重试
                </Button>
              }
              description={summary.error.message}
              showIcon
              title="创作者数据加载失败"
              type="error"
            />
          ) : null}
          {applicationId && summary.data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5">
                <Title level={3} className="!mb-3 !text-base">
                  版本差异
                </Title>
                <Paragraph>
                  {summary.data.versionDiff.fromVersion} →{" "}
                  {summary.data.versionDiff.toVersion}
                </Paragraph>
                <div className="flex flex-wrap gap-2">
                  {summary.data.versionDiff.changedFields.map((field) => (
                    <Tag key={field}>{field}</Tag>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5">
                <Title level={3} className="!mb-3 !text-base">
                  自动校验报告
                </Title>
                <Tag
                  color={
                    summary.data.validationReport.status === "passed"
                      ? "success"
                      : "error"
                  }
                >
                  {summary.data.validationReport.status === "passed"
                    ? "校验通过"
                    : "校验失败"}
                </Tag>
                <ul className="m-0 mt-3 space-y-2 pl-5">
                  {summary.data.validationReport.checks.map((check) => (
                    <li key={check.name}>
                      {check.name}：
                      {check.status === "passed" ? "通过" : "失败"}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </div>

        <CreatorSidebar />
      </div>
    </div>
  );
}
