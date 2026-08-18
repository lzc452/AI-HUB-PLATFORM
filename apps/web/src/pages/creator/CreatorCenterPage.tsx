import {
  AppstoreOutlined,
  FileTextOutlined,
  LikeOutlined,
  StarFilled,
} from "@ant-design/icons";
import { Skeleton, Tag, Typography } from "antd";
import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { KpiCard } from "../../components/common/KpiCard";
import type { ValidationCheckStatus } from "../../modules/application/application.client";
import {
  useCreatorApplications,
  useCreatorSummary,
} from "../../modules/application/useApplication";
import { formatCount } from "../../modules/marketplace/catalogMeta";
import { MessageError } from "../../shared/ui/message";
import { CreatorAppTable } from "./CreatorAppTable";
import { CreatorSidebar } from "./CreatorSidebar";
import { CreatorTrendChart } from "./CreatorTrendChart";
import { CreatorWelcomeBanner } from "./CreatorWelcomeBanner";

const { Paragraph, Title } = Typography;

const validationCheckTagColor: Record<ValidationCheckStatus, string> = {
  passed: "success",
  safe: "success",
  warning: "warning",
  info: "default",
  failed: "error",
};

const validationCheckLabel: Record<ValidationCheckStatus, string> = {
  passed: "通过",
  safe: "安全",
  warning: "警告",
  info: "提示",
  failed: "失败",
};

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
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <CreatorWelcomeBanner />

          <div className="bg-white p-2 lg:p-4 rounded-xl space-y-4">
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
                    <LikeOutlined
                      aria-hidden="true"
                      className="text-[#52c41a]"
                    />
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
            />

            <CreatorTrendChart />

            {applicationId && summary.isPending ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : null}
            <MessageError
              active={Boolean(applicationId && summary.isError)}
              cause={summary.error}
              title="创作者数据加载失败"
            />
            {applicationId && summary.data ? (
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
                  <Title level={5} className="!mb-3 !text-base">
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
                <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
                  <Title level={5} className="!mb-3 !text-base">
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
                  {summary.data.validationReport.checks.length === 0 ? (
                    <Paragraph className="!mt-3 !mb-0 text-[13px] text-[#8a94a6]">
                      该版本尚无自动校验记录
                    </Paragraph>
                  ) : (
                    <ul className="m-0 mt-3 space-y-2 pl-5">
                      {summary.data.validationReport.checks.map((check) => (
                        <li
                          className="flex flex-wrap items-center gap-2 text-[13px]"
                          key={check.code}
                        >
                          <span>{check.label}</span>
                          <Tag
                            className="!mr-0"
                            color={validationCheckTagColor[check.status]}
                          >
                            {validationCheckLabel[check.status]}
                          </Tag>
                          {check.detail ? (
                            <span className="w-full text-xs text-[#8a94a6]">
                              {check.detail}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </div>
        </div>
        <CreatorSidebar />
      </div>
    </div>
  );
}
