import {
  CheckCircleFilled,
  CloseCircleFilled,
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
  Modal,
  Popconfirm,
  Select,
  Tag,
  Tabs,
  Timeline,
  Typography,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import { SlaCountdown } from "../../components/common/SlaCountdown";
import type {
  ApplicationRecord,
  ApplicationVersionRecord,
  AssetRecord,
  PendingCatalogItem,
  ReviewRecord,
  ReviewQueueRecord,
} from "../../modules/application/application.client";
import { listAssets } from "../../modules/application/application.client";
import {
  useApplication,
  useApplicationReviews,
  useApplicationVersions,
  useClaimReview,
  useDeletePendingCatalogItem,
  usePendingCatalogItems,
  useReleaseReview,
  useReviewApplicationVersion,
  useReviewQueue,
  useTransferReviewTask,
  useValidationChecks,
} from "../../modules/application/useApplication";
import { statusMeta } from "../../modules/application/application-status";
import { useAuth } from "../../modules/auth/useAuth";
import { hasPermission } from "../../modules/auth/roles";
import {
  useDepartmentMembers,
  useDepartments,
} from "../../modules/auth/useIdentity";
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
  const transfer = useTransferReviewTask();
  const reviewAction = useReviewApplicationVersion();
  const pendingCatalogQuery = usePendingCatalogItems(applicationId);
  const removePendingCatalogItem = useDeletePendingCatalogItem(applicationId);
  const pendingCatalogItems = pendingCatalogQuery.data ?? [];
  // 审核工作台资产（截图/附件）：与应用详情一致，审核员可预览与下载。
  const assetsQuery = useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => listAssets(applicationId as string),
    queryKey: ["applications", "assets", applicationId],
  });
  const assets = assetsQuery.data ?? [];
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
          <aside className="space-y-3 flex flex-col gap-3">
            <TaskInfoCard
              actorEmployeeId={actor?.employeeId}
              app={data.app}
              canTransfer={hasPermission(actor, "application.manage")}
              claim={claim}
              release={release}
              reviewQueue={data.reviewQueue}
              transfer={transfer}
              version={data.version}
              versionId={versionId}
            />

            <ReviewActionCard
              canDecide={
                data.reviewQueue?.claimedByEmployeeId === actor?.employeeId &&
                data.reviewQueue?.status === "claimed"
              }
              reviewAction={reviewAction}
              versionId={versionId}
            />
            {pendingCatalogItems.length > 0 ? (
              <PendingCatalogCard
                items={pendingCatalogItems}
                remove={removePendingCatalogItem}
              />
            ) : null}
            {data.checks.length ? (
              <ValidationCard checks={data.checks} />
            ) : null}
          </aside>
          <main className="space-y-3 flex flex-col gap-3">
            <PreviewCard
              app={data.app}
              assets={assets}
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
  canTransfer,
  claim,
  release,
  reviewQueue,
  transfer,
  version,
  versionId,
}: {
  actorEmployeeId: string | undefined;
  app: ApplicationRecord | undefined;
  /** 转交需 APPLICATION_MANAGE（后端同步校验），无权限不显示转交按钮。 */
  canTransfer: boolean;
  claim: ReturnType<typeof useClaimReview>;
  release: ReturnType<typeof useReleaseReview>;
  reviewQueue: ReviewQueueRecord | null;
  transfer: ReturnType<typeof useTransferReviewTask>;
  version: ApplicationVersionRecord | undefined;
  versionId: string | undefined;
}) {
  const selfReview =
    app !== undefined && app.ownerEmployeeId === actorEmployeeId;
  const claimedByMe = reviewQueue?.claimedByEmployeeId === actorEmployeeId;
  const claimed = reviewQueue?.claimedByEmployeeId != null;
  const [transferOpen, setTransferOpen] = useState(false);
  return (
    <Card
      className="app-admin-card"
      styles={{ body: { padding: 0 } }}
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
      {!claimed ? (
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
      ) : claimedByMe ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            disabled={!versionId}
            loading={release.isPending}
            onClick={() => {
              if (versionId) release.mutate(versionId);
            }}
          >
            释放任务
          </Button>
          {canTransfer ? (
            <Button
              loading={transfer.isPending}
              onClick={() => setTransferOpen(true)}
            >
              转交任务
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 text-center text-[12px] text-[#8a94a6]">
          任务已被他人领取
        </div>
      )}
      {transferOpen ? (
        <TransferReviewModal
          onCancel={() => setTransferOpen(false)}
          onConfirm={(claimedByEmployeeId) => {
            if (versionId) {
              transfer.mutate({
                applicationVersionId: versionId,
                claimedByEmployeeId,
              });
            }
            setTransferOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}

/** 转交任务弹窗：选部门 → 选接收人（与应用管理移交负责人弹窗同模式）。 */
function TransferReviewModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (claimedByEmployeeId: string) => void;
}) {
  const departments = useDepartments();
  const [departmentId, setDepartmentId] = useState<string>();
  const members = useDepartmentMembers(departmentId);
  const [target, setTarget] = useState<string>();
  const departmentOptions = (departments.data ?? []).map((department) => ({
    label: department.name,
    value: department.departmentId,
  }));
  const memberOptions = (members.data ?? [])
    .filter((member) => member.status === "active")
    .map((member) => ({
      label: member.displayName,
      value: member.employeeId,
    }));
  return (
    <Modal
      okButtonProps={{ disabled: target === undefined }}
      okText="确认转交"
      onCancel={() => {
        setDepartmentId(undefined);
        setTarget(undefined);
        onCancel();
      }}
      onOk={() => {
        if (target !== undefined) onConfirm(target);
      }}
      open
      title="转交审核任务"
    >
      <div className="space-y-3">
        <Select
          aria-label="选择部门"
          onChange={setDepartmentId}
          options={departmentOptions}
          placeholder="选择部门"
          style={{ width: "100%" }}
          value={departmentId}
        />
        <Select
          aria-label="选择接收人"
          disabled={departmentId === undefined}
          onChange={setTarget}
          options={memberOptions}
          placeholder="选择接收人"
          style={{ width: "100%" }}
          value={target}
        />
      </div>
    </Modal>
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
      styles={{ body: { padding: 0 } }}
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
  canDecide,
  reviewAction,
  versionId,
}: {
  /** 当前审核员是否已认领该任务（未认领时禁用操作，避免 REVIEW_QUEUE_CLAIM_REQUIRED 400）。 */
  canDecide: boolean;
  reviewAction: ReturnType<typeof useReviewApplicationVersion>;
  versionId: string | undefined;
}) {
  const [reason, setReason] = useState("");
  return (
    <Card
      className="app-admin-card"
      styles={{ body: { padding: 0 } }}
      title={<span className="font-semibold">审核操作</span>}
    >
      {/* {!canDecide && versionId ? (
        <div className="mb-3 rounded-md bg-[#fff7e6] px-3 py-2 text-[12px] text-[#ad6800]">
          请先在任务信息中领取该审核任务，再进行通过/驳回操作。
        </div>
      ) : null} */}
      <label
        className="text-[13px] font-medium text-[#374151]"
        htmlFor="reject-reason"
      >
        <span className="text-[#f04444]">*</span> 审核意见
      </label>
      <TextArea
        id="reject-reason"
        aria-label="审核意见"
        className="mt-2"
        disabled={!versionId}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        placeholder="请输入审核意见（驳回必填）"
        showCount
        rows={4}
      />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button
          disabled={!versionId || !canDecide}
          loading={reviewAction.isPending}
          type="primary"
          onClick={() => {
            if (versionId && canDecide) {
              reviewAction.mutate({
                applicationVersionId: versionId,
                // 后端 ReviewRequestDto.comment 必填（批准也要求非空）。
                comment: "审核通过",
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
          disabled={!versionId || !canDecide}
          loading={reviewAction.isPending}
          onClick={() => {
            if (!versionId || !canDecide) return;
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
      {/* <div className="mt-3 text-[11px] text-[#8a94a6]">
        <InfoCircleOutlined /> 提示：不可审核自己参与的应用，请按流程完成审核。
      </div> */}
    </Card>
  );
}

function PendingCatalogCard({
  items,
  remove,
}: {
  items: PendingCatalogItem[];
  remove: ReturnType<typeof useDeletePendingCatalogItem>;
}) {
  return (
    <Card
      className="app-admin-card"
      styles={{ body: { padding: 0 } }}
      title={<span className="font-semibold">自定义分类/标签</span>}
    >
      <div className="space-y-3">
        {items.map((item) => (
          <div className="flex items-center gap-2" key={item.itemId}>
            <Tag color={item.kind === "category" ? "blue" : "geekblue"}>
              {item.kind === "category" ? "分类" : "标签"}
            </Tag>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[#374151]">
              {item.name}
            </span>
            <Popconfirm
              cancelText="取消"
              okText="确认删除"
              onConfirm={() => remove.mutate(item.itemId)}
              title={`删除自定义${item.kind === "category" ? "分类" : "标签"}「${item.name}」？`}
            >
              <Button
                aria-label={`删除 ${item.name}`}
                danger
                loading={remove.isPending}
                size="small"
                type="text"
              >
                删除
              </Button>
            </Popconfirm>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PreviewCard({
  app,
  assets,
  checks,
  version,
}: {
  app: ApplicationRecord | undefined;
  assets: readonly AssetRecord[];
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
            children: (
              <PreviewOverview app={app} assets={assets} version={version} />
            ),
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
  assets: _assets,
  version,
}: {
  app: ApplicationRecord | undefined;
  assets: readonly AssetRecord[];
  version: ApplicationVersionRecord | undefined;
}) {
  // 预览内容使用设计稿中的中文间隔，保留信息层级。
  const status = statusMeta(app?.status ?? "unknown");

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        {/* <OcrApplicationIcon className="h-20 w-20" /> */}

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
      {/* <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-[#e4eaf2] p-4">
          <h4 className="mb-3 font-semibold">截图预览</h4>
          {screenshots.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {screenshots.map((asset) => (
                <ScreenshotImage
                  applicationId={app?.applicationId}
                  assetId={asset.assetId}
                  key={asset.assetId}
                />
              ))}
            </div>
          ) : (
            <Empty
              description="暂无截图资产"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </section>
        <section className="rounded-lg border border-[#e4eaf2] p-4">
          <h4 className="mb-3 font-semibold">相关附件</h4>
          <div className="space-y-3">
            {attachments.length > 0 ? (
              attachments.map((asset) => (
                <div
                  className="flex items-center gap-2 text-[12px]"
                  key={asset.assetId}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#eef5ff] text-[#1677ff]">
                    <FileTextOutlined />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                  <span className="text-[#8a94a6]">
                    {formatBytes(asset.sizeBytes)}
                  </span>
                  <Button
                    aria-label={`下载 ${asset.name}`}
                    icon={<DownloadOutlined />}
                    onClick={() =>
                      void downloadAssetContent(
                        app?.applicationId ?? "",
                        asset.assetId,
                        asset.name,
                      )
                    }
                    size="small"
                    type="link"
                  >
                    下载
                  </Button>
                </div>
              ))
            ) : (
              <Empty
                description="暂无附件"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
            {version ? (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#eef5ff] text-[#1677ff]">
                  <FileTextOutlined />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {version.artifactKey}
                </span>
                <span className="text-[#8a94a6]">
                  版本制品（安全校验后可用）
                </span>
              </div>
            ) : null}
          </div>
        </section>
      </div> */}
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
      styles={{ body: { padding: 0 } }}
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
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
