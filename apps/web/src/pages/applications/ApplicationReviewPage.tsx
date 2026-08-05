import { Alert, Empty, Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import type { ReviewRecord } from "../../modules/application/application.client";
import { useApplicationReviews } from "../../modules/application/useApplication";

const { Paragraph, Text, Title } = Typography;

const decisionMeta: Record<
  ReviewRecord["decision"],
  { color: string; label: string }
> = {
  approve: { color: "success", label: "Approved" },
  reject: { color: "error", label: "Rejected" },
  request_changes: { color: "warning", label: "Request changes" },
};

export default function ApplicationReviewPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } =
    useApplicationReviews(applicationId);

  return (
    <ApplicationAdminPage
      description="Inspect review readiness and the audit-safe review history."
      title="Review"
    >
      <section aria-labelledby="review-heading" className="space-y-4">
        <Title id="review-heading" level={2} className="!mb-0">
          Review history
        </Title>
        {isPending ? <Spin aria-label="审核记录加载中" /> : null}
        {isError ? (
          <Alert
            description={error.message}
            showIcon
            title="审核记录加载失败"
            type="error"
          />
        ) : null}
        {data && data.length === 0 ? <Empty description="暂无审核记录" /> : null}
        {data?.map((review) => (
          <div
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
            key={review.reviewId}
          >
            <Tag color={decisionMeta[review.decision].color}>
              {decisionMeta[review.decision].label}
            </Tag>
            <Paragraph className="!mb-0 !mt-3">
              {review.comment || "无审核意见"}
            </Paragraph>
            <Text type="secondary" className="text-xs">
              {review.reviewerEmployeeId} ·{" "}
              {new Date(review.createdAt).toLocaleDateString("zh-CN")}
            </Text>
          </div>
        ))}
      </section>
    </ApplicationAdminPage>
  );
}
