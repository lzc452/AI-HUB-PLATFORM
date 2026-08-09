import { Empty, Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import { MessageError } from "../../shared/ui/message";
import type { ReviewRecord } from "../../modules/application/application.client";
import { useApplicationReviews } from "../../modules/application/useApplication";

const { Paragraph, Text, Title } = Typography;

const decisionMeta: Record<
  ReviewRecord["decision"],
  { color: string; label: string }
> = {
  approve: { color: "success", label: "通过" },
  reject: { color: "error", label: "驳回" },
  request_changes: { color: "warning", label: "请求变更" },
};

export default function ApplicationReviewPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } =
    useApplicationReviews(applicationId);

  return (
    <ApplicationAdminPage
      description="查看审核就绪状态与可审计的审核记录。"
      title="审核工作台"
    >
      <section aria-labelledby="review-heading" className="space-y-4">
        <Title id="review-heading" level={2} className="!mb-0">
          审核记录
        </Title>
        {isPending ? <Spin aria-label="审核记录加载中" /> : null}
        <MessageError active={isError} cause={error} title="审核记录加载失败" />
        {data && data.length === 0 ? (
          <Empty description="暂无审核记录" />
        ) : null}
        {data?.map((review) => (
          <div
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-4"
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
