import {
  CheckCircleFilled,
  CloseCircleFilled,
  DownloadOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  SafetyCertificateFilled,
  WarningFilled,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Input,
  Tag,
  Tabs,
  Timeline,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ApplicationAdminPage,
  OcrApplicationIcon,
} from "../../components/common/ApplicationAdminPage";
import { SlaCountdown } from "../../components/common/SlaCountdown";
import type {
  ApplicationRecord,
  ApplicationVersionRecord,
  ReviewRecord,
  ReviewQueueRecord,
} from "../../modules/application/application.client";
import {
  useApplication,
  useApplicationReviews,
  useApplicationVersions,
  useClaimReview,
  useReleaseReview,
  useReviewApplicationVersion,
  useReviewQueue,
  useValidationChecks,
} from "../../modules/application/useApplication";
import { statusMeta } from "../../modules/application/application-status";
import { useAuth } from "../../modules/auth/useAuth";
import { MessageError, showWarningMessage } from "../../shared/ui/message";

const { Text } = Typography;
const { TextArea } = Input;

type Check = {
  name: string;
  status: "passed" | "safe" | "warning" | "info" | "failed";
  description?: string;
};
type ViewModel = {
  app: ApplicationRecord | undefined;
  version: ApplicationVersionRecord | undefined;
  reviews: ReviewRecord[];
  checks: Check[];
  reviewQueue: ReviewQueueRecord | null;
};

export default function ApplicationReviewPage() {
  const { actor } = useAuth();
  const { applicationId } = useParams();
  const applicationQuery = useApplication(applicationId);
  const versionsQuery = useApplicationVersions(applicationId);
  const reviewsQuery = useApplicationReviews(applicationId);
  const version = versionsQuery.data?.[0];
  const reviewQueueQuery = useReviewQueue(version?.applicationVersionId);
  const validationChecksQuery = useValidationChecks(
    version?.applicationVersionId,
  );
  const claim = useClaimReview();
  const release = useReleaseReview();
  const reviewAction = useReviewApplicationVersion();
  const data = useMemo<ViewModel>(
    () => ({
      app: applicationQuery.data,
      version,
      reviews: reviewsQuery.data ?? [],
      checks: (validationChecksQuery.data ?? []).map((check) => ({
        name: check.label,
        status: check.status,
        ...(check.detail ? { description: check.detail } : {}),
      })),
      reviewQueue: reviewQueueQuery.data ?? null,
    }),
    [
      applicationQuery.data,
      reviewQueueQuery.data,
      reviewsQuery.data,
      validationChecksQuery.data,
      version,
    ],
  );
  const pending =
    applicationQuery.isPending ||
    versionsQuery.isPending ||
    reviewsQuery.isPending;
  const error =
    applicationQuery.error ??
    versionsQuery.error ??
    reviewsQuery.error ??
    validationChecksQuery.error;
  const hasError =
    applicationQuery.isError ||
    versionsQuery.isError ||
    reviewsQuery.isError ||
    validationChecksQuery.isError;

  const versionId = version?.applicationVersionId;

  return (
    <ApplicationAdminPage
      description="审核认领、审核意见、SLA 和历史记录。"
      showNavigation={false}
      title="审核工作台"
    >
      {pending ? <SpinPlaceholder /> : null}
      <MessageError
        active={hasError}
        cause={error}
        title="审核工作台加载失败"
      />
      {!pending && !hasError ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <TaskInfoCard
              actorEmployeeId={actor?.employeeId}
              app={data.app}
              claim={claim}
              release={release}
              reviewQueue={data.reviewQueue}
              version={data.version}
              versionId={versionId}
            />
            <ValidationCard checks={data.checks} />
            <ReviewActionCard
              reviewAction={reviewAction}
              versionId={versionId}
            />
          </aside>
          <main className="space-y-3">
            <PreviewCard
              app={data.app}
              checks={data.checks}
              version={data.version}
            />
            <ReviewHistoryCard reviews={data.reviews} />
          </main>
        </div>
      ) : null}
    </ApplicationAdminPage>
  );
}

function SpinPlaceholder() {
  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-white p-5 text-sm text-[#697386]">
      正在加载审核工作台…
    </div>
  );
}

function TaskInfoCard({
  actorEmployeeId,
  app,
  claim,
  release,
  reviewQueue,
  version,
  versionId,
}: {
  actorEmployeeId: string | undefined;
  app: ApplicationRecord | undefined;
  claim: ReturnType<typeof useClaimReview>;
  release: ReturnType<typeof useReleaseReview>;
  reviewQueue: ReviewQueueRecord | null;
  version: ApplicationVersionRecord | undefined;
  versionId: string | undefined;
}) {
  const selfReview =
    app !== undefined && app.ownerEmployeeId === actorEmployeeId;
  return (
    <Card
      className="app-admin-card"
      styles={{ body: { padding: 16 } }}
      title={<span className="font-semibold">审核任务信息</span>}
    >
      <div className="space-y-3 text-[13px]">
        <InfoLine label="SLA 剩余时间">
          <SlaCountdown
            className="text-[18px] font-semibold text-[#f59e0b]"
            dueAt={reviewQueue?.slaDueAt}
          />
        </InfoLine>
        <InfoLine label="提交人">{app?.ownerEmployeeId ?? "-"}</InfoLine>
        <InfoLine label="提交时间">
          <span>
            <i
              aria-hidden="true"
              className="app-ui-icon app-ui-icon-calendar mr-1 text-[#8a94a6]"
            />
            {version ? formatDate(version.createdAt) : "-"}
          </span>
        </InfoLine>
        <InfoLine label="当前领取人">
          <span>
            <i
              aria-hidden="true"
              className="app-ui-icon app-ui-icon-user mr-1 text-[#8a94a6]"
            />
            {reviewQueue?.claimedByEmployeeId ?? "待认领"}
          </span>
        </InfoLine>
      </div>
      <Button
        block
        className="mt-4"
        disabled={!versionId || selfReview}
        loading={claim.isPending}
        title={selfReview ? "禁止审核自己提交的应用" : undefined}
        type="primary"
        onClick={() => {
          if (versionId) claim.mutate(versionId);
        }}
      >
        领取任务
      </Button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          disabled={!versionId}
          loading={release.isPending}
          onClick={() => {
            if (versionId) release.mutate(versionId);
          }}
        >
          释放任务
        </Button>
        <Button disabled title="V1 暂不支持转交">
          转交任务
        </Button>
      </div>
    </Card>
  );
}

const iconMap = {
  failed: <CloseCircleFilled />,
  info: <InfoCircleOutlined />,
  passed: <CheckCircleFilled />,
  safe: <SafetyCertificateFilled />,
  warning: <WarningFilled />,
};

const colorMap = {
  failed: "#f5222d",
  info: "#1677ff",
  passed: "#20b26b",
  safe: "#20b26b",
  warning: "#f59e0b",
};

const labelMap = {
  failed: "失败",
  info: "已生成",
  passed: "通过",
  safe: "安全",
  warning: "警告",
};

function ValidationCard({ checks }: { checks: Check[] }) {
  return (
    <Card
      className="app-admin-card"
      styles={{ body: { padding: 16 } }}
      title={<span className="font-semibold">自动校验报告</span>}
    >
      <div className="space-y-3">
        {checks.map((check) => (
          <div className="flex items-start gap-2" key={check.name}>
            <span className="mt-0.5" style={{ color: colorMap[check.status] }}>
              {iconMap[check.status]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-[13px]">
                <span>{check.name}</span>
                <span style={{ color: colorMap[check.status] }}>
                  {labelMap[check.status]}
                </span>
              </div>
              {check.description ? (
                <div className="text-[11px] text-[#8a94a6]">
                  {check.description}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReviewActionCard({
  reviewAction,
  versionId,
}: {
  reviewAction: ReturnType<typeof useReviewApplicationVersion>;
  versionId: string | undefined;
}) {
  const [reason, setReason] = useState("");
  return (
    <Card
      className="app-admin-card"
      styles={{ body: { padding: 16 } }}
      title={<span className="font-semibold">审核操作</span>}
    >
      <label
        className="text-[13px] font-medium text-[#374151]"
        htmlFor="reject-reason"
      >
        <span className="text-[#f04444]">*</span> 驳回原因
      </label>
      <TextArea
        id="reject-reason"
        aria-label="驳回原因"
        className="mt-2"
        disabled={!versionId}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        placeholder="请输入驳回原因（必填）"
        showCount
        rows={4}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          disabled={!versionId}
          loading={reviewAction.isPending}
          type="primary"
          onClick={() => {
            if (versionId) {
              reviewAction.mutate({
                applicationVersionId: versionId,
                comment: "",
                decision: "approve",
              });
            }
          }}
        >
          通过审核
        </Button>
        <Button
          aria-label="驳回"
          danger
          disabled={!versionId}
          loading={reviewAction.isPending}
          onClick={() => {
            if (!versionId) return;
            if (!reason.trim()) {
              showWarningMessage("请输入驳回原因");
              return;
            }
            reviewAction.mutate({
              applicationVersionId: versionId,
              comment: reason.trim(),
              decision: "reject",
            });
          }}
        >
          驳回
        </Button>
      </div>
      <div className="mt-3 text-[11px] text-[#8a94a6]">
        <InfoCircleOutlined /> 提示：不可审核自己参与的应用，请按流程完成审核。
      </div>
    </Card>
  );
}

function PreviewCard({
  app,
  checks,
  version,
}: {
  app: ApplicationRecord | undefined;
  checks: Check[];
  version: ApplicationVersionRecord | undefined;
}) {
  return (
    <Card className="app-admin-card" styles={{ body: { padding: 0 } }}>
      <Tabs
        className="review-preview-tabs"
        defaultActiveKey="preview"
        items={[
          {
            key: "preview",
            label: "预览详情",
            children: <PreviewOverview app={app} version={version} />,
          },
          {
            key: "diff",
            label: "版本差异",
            children: <Empty description="版本差异对比将在下一版本开放" />,
          },
          {
            key: "validation",
            label: "自动校验报告",
            children: <ValidationSummary checks={checks} />,
          },
          {
            key: "risk",
            label: "风险声明",
            children: <Empty description="暂无风险声明" />,
          },
        ]}
      />
    </Card>
  );
}

function PreviewOverview({
  app,
  version,
}: {
  app: ApplicationRecord | undefined;
  version: ApplicationVersionRecord | undefined;
}) {
  // 预览内容使用设计稿中的中文间隔，保留信息层级。
  const status = statusMeta(app?.status ?? "unknown");

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <OcrApplicationIcon className="h-20 w-20" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[20px] font-semibold">
              {app?.name ?? "未命名应用"}
            </h3>
            <Tag color={status.color}>{status.text}</Tag>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[13px] text-[#697386]">
            <span className="inline-flex items-center gap-1">
              <i
                aria-hidden="true"
                className="app-ui-icon app-ui-icon-star text-[#f59e0b]"
              />
              评分：暂无数据
            </span>
            <span>使用量：暂无数据</span>
            <span>
              所属部门：
              <strong className="text-[#374151]">
                {app?.departmentId ?? "未提供"}
              </strong>
            </span>
            <span>
              责任人：
              <strong className="text-[#374151]">
                {app?.ownerEmployeeId ?? "未提供"}
              </strong>
            </span>
          </div>
        </div>
        <Link to={app ? `/applications/${app.applicationId}` : "#"}>
          <Button disabled={!app} size="small">
            查看应用详情
          </Button>
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-[#e4eaf2] p-4">
          <h4 className="mb-2 font-semibold">详细介绍</h4>
          <p className="m-0 text-[13px] leading-6 text-[#596579]">
            {app?.summary || "暂无应用简介"}
          </p>
          <h4 className="mb-2 mt-4 font-semibold">版本变更</h4>
          <p className="m-0 text-[13px] leading-6 text-[#596579]">
            {version?.changelog || "暂无版本变更说明"}
          </p>
        </section>
        <section className="rounded-lg border border-[#e4eaf2] p-4">
          <h4 className="mb-2 font-semibold">关键特性</h4>
          <dl className="m-0 space-y-2 text-[13px] text-[#596579]">
            <div className="flex justify-between gap-3">
              <dt>安全扫描</dt>
              <dd className="m-0">{version?.scanStatus ?? "unknown"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>SHA-256</dt>
              <dd className="m-0 truncate">
                {version?.artifactSha256 ?? "未提供"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>签名</dt>
              <dd className="m-0">
                {version?.artifactSignature ? "已签名" : "未提供"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-[#e4eaf2] p-4">
          <h4 className="mb-3 font-semibold">截图预览</h4>
          <Empty
            description="暂无截图资产"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </section>
        <section className="rounded-lg border border-[#e4eaf2] p-4">
          <h4 className="mb-3 font-semibold">相关附件</h4>
          <div className="space-y-3">
            {version ? (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="flex h-7 w-7 items-center justify-center rounded bg-[#eef5ff] text-[#1677ff]">
                  <FileTextOutlined />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {version.artifactKey}
                </span>
                <span className="text-[#8a94a6]">安全校验后可用</span>
                <DownloadOutlined className="text-[#8a94a6]" />
              </div>
            ) : (
              <Empty
                description="暂无制品附件"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </div>
        </section>
      </div>
      <Text type="secondary">
        提交版本：{version?.version ?? "未提供"} - 当前状态：{status.text}
      </Text>
    </div>
  );
}

function ValidationSummary({ checks }: { checks: Check[] }) {
  const timelineColor = {
    failed: "red",
    info: "blue",
    passed: "green",
    safe: "green",
    warning: "orange",
  };
  return (
    <div className="p-5">
      {checks.length === 0 ? (
        <Empty description="该版本尚无自动校验记录" />
      ) : (
        <Timeline
          items={checks.map((item) => ({
            color: timelineColor[item.status],
            children: (
              <span className="text-[13px]">
                {item.name}
                <Tag color={colorMap[item.status]}>{labelMap[item.status]}</Tag>
                {item.description ? (
                  <div className="text-[11px] text-[#8a94a6]">
                    {item.description}
                  </div>
                ) : null}
              </span>
            ),
          }))}
        />
      )}
    </div>
  );
}
function ReviewHistoryCard({ reviews }: { reviews: ReviewRecord[] }) {
  return (
    <Card
      className="app-admin-card"
      styles={{ body: { padding: 20 } }}
      title={<span className="font-semibold">审核意见记录</span>}
    >
      {reviews.length === 0 ? (
        <Empty description="暂无审核记录" />
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              className="flex gap-3 border-b border-[#edf0f5] pb-4 last:border-0 last:pb-0"
              key={review.reviewId}
            >
              <Avatar className="shrink-0 bg-[#1677ff]">
                {review.reviewerEmployeeId.slice(0, 1)}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[13px]">
                    {review.reviewerEmployeeId}
                  </strong>
                  <Tag
                    color={
                      review.decision === "approve"
                        ? "success"
                        : review.decision === "reject"
                          ? "error"
                          : "warning"
                    }
                  >
                    {review.decision === "approve"
                      ? "通过建议"
                      : review.decision === "reject"
                        ? "驳回"
                        : "补充说明"}
                  </Tag>
                  <span className="ml-auto text-[12px] text-[#8a94a6]">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                <p className="m-0 mt-1 text-[13px] text-[#596579]">
                  {review.comment || "暂无审核意见"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
function InfoLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#697386]">{label}</span>
      <span className="text-right text-[#374151]">{children}</span>
    </div>
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
