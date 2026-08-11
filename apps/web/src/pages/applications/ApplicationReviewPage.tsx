import {
  CalendarFilled,
  CheckCircleFilled,
  CheckCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  HeartOutlined,
  InfoCircleOutlined,
  SafetyCertificateFilled,
  StarFilled,
  SwapOutlined,
  UserOutlined,
  WarningFilled,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Tabs,
  Timeline,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import type {
  ApplicationRecord,
  ApplicationVersionRecord,
  ReviewRecord,
} from "../../modules/application/application.client";
import {
  useApplication,
  useApplicationReviews,
  useApplicationVersions,
} from "../../modules/application/useApplication";
import {
  MessageError,
  showSuccessMessage,
  showWarningMessage,
} from "../../shared/ui/message";

const { Paragraph, Text, Title, Link } = Typography;
const { TextArea } = Input;

type ApplicationStatus = ApplicationRecord["status"];

type CheckStatus = "passed" | "safe" | "warning" | "info";

interface ValidationCheck {
  description?: string;
  name: string;
  status: CheckStatus;
}

interface AttachmentItem {
  date: string;
  id: string;
  name: string;
  size: string;
}

interface ScreenshotItem {
  alt: string;
  id: string;
}

interface ReviewHistoryItem extends ReviewRecord {
  decisionColor: string;
  decisionLabel: string;
  reviewerDept: string;
  reviewerName: string;
}

interface ReviewTaskView {
  appIconText: string;
  appName: string;
  applicationId: string;
  attachments: AttachmentItem[];
  currentAssignee: string;
  department: string;
  description: string;
  keyCharacteristics: string[];
  keyFeatures: string[];
  likeCount: string;
  maintainer: string;
  owner: string;
  rating: number;
  reviewCount: number;
  reviews: ReviewHistoryItem[];
  screenshots: ScreenshotItem[];
  slaRemaining: string;
  status: ApplicationStatus;
  statusLabel: string;
  submitter: string;
  submitTime: string;
  tags: string[];
  validationChecks: ValidationCheck[];
  version: string;
}

const STATUS_LABEL_MAP: Record<ApplicationStatus, string> = {
  approved: "已通过",
  archived: "已归档",
  draft: "草稿",
  in_review: "待审核",
  published: "已上架",
  withdrawn: "已下架",
};

const CHECK_META: Record<
  CheckStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  info: {
    color: "#1677ff",
    icon: <InfoCircleOutlined />,
    label: "已生成",
  },
  passed: {
    color: "#52c41a",
    icon: <CheckCircleFilled />,
    label: "通过",
  },
  safe: {
    color: "#52c41a",
    icon: <SafetyCertificateFilled />,
    label: "安全",
  },
  warning: {
    color: "#fa8c16",
    icon: <WarningFilled />,
    label: "警告",
  },
};

/**
 * 将应用真实数据与审核工作台设计稿占位数据融合。
 * 后端暂无完整的审核任务/校验报告/附件等接口，因此以设计稿示例为默认占位，
 * 同时覆盖真实应用名称、状态、版本、责任人等字段。
 */
function buildReviewTaskView(
  application: ApplicationRecord | undefined,
  versions: ApplicationVersionRecord[] | undefined,
  reviews: ReviewRecord[] | undefined,
): ReviewTaskView {
  const latestVersion = versions?.[0];
  const status = application?.status ?? "in_review";

  return {
    appIconText: (application?.name ?? "OCR票据识别").slice(0, 2),
    appName: application?.name ?? "OCR票据识别",
    applicationId: application?.applicationId ?? "",
    attachments: [
      {
        date: "2024-04-28",
        id: "att-1",
        name: "OCR票据识别_产品白皮书.pdf",
        size: "2.34 MB",
      },
      {
        date: "2024-04-28",
        id: "att-2",
        name: "OCR票据识别_接入指南.docx",
        size: "1.21 MB",
      },
      {
        date: "2024-04-28",
        id: "att-3",
        name: "OCR票据识别_字段说明.xlsx",
        size: "98.6 KB",
      },
    ],
    currentAssignee: "王芳",
    department: application?.departmentId ?? "财务部",
    description:
      "业务场景：发票增值税发票、交通票据、火车票等类型，提供高效准确的票据识别与结构化输出，助力财务报销和业务数据自动化处理。",
    keyCharacteristics: [
      "高精度 OCR 识别，准确率 ≥ 98%",
      "支持多语言识别（中 / 英 / 日 / 韩）",
      "自动校验票据信息，异常预警",
      "提供开放 API，方便系统集成",
    ],
    keyFeatures: [
      "自动化识别增值税发票、交通票据、火车票等类型",
      "提高财务报销效率，提升数据及结构化率",
      "自动校验票据信息，异常预警",
      "支持多语言识别，支持数字语言识别",
    ],
    likeCount: "1.6k",
    maintainer: application?.maintainerEmployeeId ?? "王芳 / 刘涛",
    owner: application?.ownerEmployeeId ?? "李小龙",
    rating: 4.8,
    reviewCount: 210,
    reviews: enrichReviews(reviews),
    screenshots: [
      { alt: "OCR票据识别截图-1", id: "ss-1" },
      { alt: "OCR票据识别截图-2", id: "ss-2" },
      { alt: "OCR票据识别截图-3", id: "ss-3" },
    ],
    slaRemaining: "18h 23m",
    status,
    statusLabel: STATUS_LABEL_MAP[status] ?? STATUS_LABEL_MAP.in_review,
    submitter: application?.ownerEmployeeId ?? "李小龙",
    submitTime: latestVersion?.createdAt ?? "2026-08-01T10:20:00+08:00",
    tags: ["待审核", "Web应用", "高优先级"],
    validationChecks: [
      { name: "格式校验", status: "passed" },
      {
        description: "未检测到病毒或风险文件",
        name: "文件扫描",
        status: "safe",
      },
      {
        description: "证书将于 2026-09-15 过期",
        name: "安装包签名",
        status: "warning",
      },
      {
        description: "安装包大小 98.6 KB，符合限制",
        name: "大小限制",
        status: "passed",
      },
      {
        description: "b3e5c2af…e9f7c4b8（完整值）",
        name: "SHA-256",
        status: "info",
      },
    ],
    version: latestVersion?.version ?? "v2.4.1",
  };
}

function enrichReviews(
  reviews: ReviewRecord[] | undefined,
): ReviewHistoryItem[] {
  if (!reviews || reviews.length === 0) {
    return [
      {
        applicationId: "app-001",
        applicationOwnerEmployeeId: "emp-001",
        applicationVersionId: "ver-001",
        comment: "应用整体功能完善，自动校验通过，建议通过审核并上线。",
        createdAt: "2026-08-01T09:30:00+08:00",
        decision: "approve",
        decisionColor: "success",
        decisionLabel: "通过建议",
        reviewId: "review-mock-1",
        reviewerDept: "审核组",
        reviewerEmployeeId: "emp-002",
        reviewerName: "王芳",
      } as ReviewHistoryItem,
      {
        applicationId: "app-001",
        applicationOwnerEmployeeId: "emp-001",
        applicationVersionId: "ver-001",
        comment:
          "安装包签名证书将于 2026-09-15 过期，请关注更新并及时续签。",
        createdAt: "2026-08-01T09:05:00+08:00",
        decision: "request_changes",
        decisionColor: "warning",
        decisionLabel: "补充说明",
        reviewId: "review-mock-2",
        reviewerDept: "安全组",
        reviewerEmployeeId: "emp-003",
        reviewerName: "刘涛",
      } as ReviewHistoryItem,
    ];
  }

  const decisionMeta: Record<
    ReviewRecord["decision"],
    { color: string; label: string }
  > = {
    approve: { color: "success", label: "通过建议" },
    reject: { color: "error", label: "驳回原因" },
    request_changes: { color: "warning", label: "补充说明" },
  };

  const nameMap: Record<string, { dept: string; name: string }> = {
    "emp-002": { dept: "审核组", name: "王芳" },
    "emp-003": { dept: "安全组", name: "刘涛" },
  };

  return reviews.map((review) => {
    const meta = decisionMeta[review.decision];
    const mapped =
      nameMap[review.reviewerEmployeeId] ??
      ({ dept: "审核组", name: review.reviewerEmployeeId });
    return {
      ...review,
      decisionColor: meta.color,
      decisionLabel: meta.label,
      reviewerDept: mapped.dept,
      reviewerName: mapped.name,
    };
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ApplicationReviewPage() {
  const { applicationId } = useParams();
  const applicationQuery = useApplication(applicationId);
  const versionsQuery = useApplicationVersions(applicationId);
  const reviewsQuery = useApplicationReviews(applicationId);

  const data = useMemo(
    () =>
      buildReviewTaskView(
        applicationQuery.data,
        versionsQuery.data,
        reviewsQuery.data,
      ),
    [applicationQuery.data, versionsQuery.data, reviewsQuery.data],
  );

  const isPending =
    applicationQuery.isPending || versionsQuery.isPending || reviewsQuery.isPending;
  const isError =
    applicationQuery.isError || versionsQuery.isError || reviewsQuery.isError;
  const error = applicationQuery.error ?? versionsQuery.error ?? reviewsQuery.error;

  return (
    <ApplicationAdminPage
      description={`${data.appName} 的审核认领、审核意见、SLA 和历史记录。`}
      title="审核工作台"
    >
      {isPending ? <Spin aria-label="审核工作台数据加载中" /> : null}
      <MessageError active={isError} cause={error} title="审核工作台加载失败" />

      {!isPending && !isError ? (
        <div className="space-y-4">
          <ReviewHeader data={data} />
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8} xl={7}>
              <Space className="w-full" direction="vertical" size={16}>
                <TaskInfoCard data={data} />
                <ValidationReportCard data={data} />
                <ReviewActionCard />
              </Space>
            </Col>
            <Col xs={24} lg={16} xl={17}>
              <Space className="w-full" direction="vertical" size={16}>
                <PreviewPanel data={data} />
                <ReviewHistoryCard reviews={data.reviews} />
              </Space>
            </Col>
          </Row>
        </div>
      ) : null}
    </ApplicationAdminPage>
  );
}

function ReviewHeader({ data }: { data: ReviewTaskView }) {
  return (
    <Card
      className="rounded-xl border-[#d9d9d9]"
      styles={{ body: { padding: 20 } }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] text-lg font-bold text-white shadow-sm">
            {data.appIconText}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Title className="!mb-0 !text-xl !font-semibold !text-[#1f1f1f]" level={3}>
                {data.appName}
              </Title>
              <Tag color="warning">{data.statusLabel}</Tag>
              <Tag color="blue">Web应用</Tag>
              <Tag color="red">高优先级</Tag>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#595959]">
              <span>
                当前版本 <Text className="text-[#1f1f1f]">{data.version}</Text>
              </span>
              <span>
                所属部门 <Text className="text-[#1f1f1f]">{data.department}</Text>
              </span>
              <span>
                责任人 <Text className="text-[#1f1f1f]">{data.owner}</Text>
              </span>
              <span>
                维护人 <Text className="text-[#1f1f1f]">{data.maintainer}</Text>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 lg:ml-auto">
          <HeaderMetaItem
            icon={<CalendarFilled className="text-[#1677ff]" />}
            label="提交时间"
            value={formatDateTime(data.submitTime)}
          />
          <HeaderMetaItem
            icon={<UserOutlined className="text-[#1677ff]" />}
            label="提交人"
            value={data.submitter}
          />
          <HeaderMetaItem
            icon={<FieldTimeOutlined className="text-[#fa8c16]" />}
            label="SLA 剩余"
            value={data.slaRemaining}
            valueClassName="text-[#fa8c16]"
          />
        </div>
      </div>
    </Card>
  );
}

function HeaderMetaItem({
  icon,
  label,
  value,
  valueClassName = "text-[#1f1f1f]",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-[140px] items-center gap-3 rounded-lg bg-[#f5f5f5] px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-base shadow-sm">
        {icon}
      </div>
      <div>
        <div className="text-xs text-[#8c8c8c]">{label}</div>
        <div className={`text-sm font-medium ${valueClassName}`}>{value}</div>
      </div>
    </div>
  );
}

function TaskInfoCard({ data }: { data: ReviewTaskView }) {
  return (
    <Card
      className="rounded-xl border-[#d9d9d9]"
      styles={{ body: { padding: 16 } }}
      title={<span className="text-base font-medium text-[#1f1f1f]">审核任务信息</span>}
    >
      <Descriptions
        className="review-task-descriptions"
        column={1}
        items={[
          {
            children: (
              <Text className="text-base font-semibold text-[#fa8c16]">
                {data.slaRemaining}
              </Text>
            ),
            key: "sla",
            label: "SLA 剩余时间",
          },
          {
            children: (
              <Text>
                {data.submitter}（{data.department}）
              </Text>
            ),
            key: "submitter",
            label: "提交人",
          },
          {
            children: <Text>{formatDateTime(data.submitTime)}</Text>,
            key: "submitTime",
            label: "提交时间",
          },
          {
            children: (
              <div className="flex items-center gap-1">
                <UserOutlined className="text-[#1677ff]" />
                <Text>{data.currentAssignee}</Text>
              </div>
            ),
            key: "assignee",
            label: "当前领取人",
          },
        ]}
        size="small"
      />

      <div className="mt-4 space-y-2">
        <Button
          block
          aria-label="领取任务"
          className="!h-10 !rounded-md !text-sm !font-medium"
          icon={<CheckCircleOutlined aria-hidden="true" />}
          onClick={() => showSuccessMessage("任务领取成功（只读预览）")}
          type="primary"
        >
          领取任务
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            aria-label="释放任务"
            className="!h-9 !rounded-md !text-sm"
            onClick={() => showWarningMessage("已释放任务（只读预览）")}
          >
            释放任务
          </Button>
          <Button
            aria-label="转交任务"
            className="!h-9 !rounded-md !text-sm"
            icon={<SwapOutlined aria-hidden="true" />}
            onClick={() => showWarningMessage("任务转交（只读预览）")}
          >
            转交任务
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ValidationReportCard({ data }: { data: ReviewTaskView }) {
  return (
    <Card
      className="rounded-xl border-[#d9d9d9]"
      styles={{ body: { padding: 16 } }}
      title={
        <span className="text-base font-medium text-[#1f1f1f]">自动校验报告</span>
      }
    >
      <Space className="w-full" direction="vertical" size={12}>
        {data.validationChecks.map((check) => {
          const meta = CHECK_META[check.status];
          return (
            <div className="flex items-start gap-3" key={check.name}>
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm"
                style={{ color: meta.color }}
              >
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <Text className="!mb-0 text-[#1f1f1f]">{check.name}</Text>
                  <Tag
                    bordered={false}
                    className="!m-0 !text-xs"
                    color={meta.color}
                  >
                    {meta.label}
                  </Tag>
                </div>
                {check.description ? (
                  <Text className="!mb-0 text-xs text-[#8c8c8c]">
                    {check.description}
                  </Text>
                ) : null}
              </div>
            </div>
          );
        })}
      </Space>
    </Card>
  );
}

function ReviewActionCard() {
  const [reason, setReason] = useState("");

  const handleApprove = () => {
    showSuccessMessage("已通过审核（只读预览）");
  };

  const handleReject = () => {
    if (!reason.trim()) {
      showWarningMessage("请输入驳回原因");
      return;
    }
    showSuccessMessage("已驳回并记录原因（只读预览）");
  };

  return (
    <Card
      className="rounded-xl border-[#d9d9d9]"
      styles={{ body: { padding: 16 } }}
      title={<span className="text-base font-medium text-[#1f1f1f]">审核操作</span>}
    >
      <Space className="w-full" direction="vertical" size={12}>
        <div>
          <Text className="text-sm text-[#1f1f1f]">驳回原因</Text>
          <Text className="text-xs text-[#8c8c8c]">（必填）</Text>
          <TextArea
            aria-label="驳回原因"
            className="mt-2 !rounded-md"
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请输入驳回原因"
            rows={4}
            showCount
            value={reason}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            aria-label="通过审核"
            className="!h-10 !rounded-md !text-sm !font-medium"
            icon={<CheckCircleOutlined aria-hidden="true" />}
            onClick={handleApprove}
            type="primary"
          >
            通过审核
          </Button>
          <Button
            aria-label="驳回"
            className="!h-10 !rounded-md !text-sm !font-medium"
            danger
            onClick={handleReject}
          >
            驳回
          </Button>
        </div>
        <Button
          block
          aria-label="保存备注"
          className="!h-9 !rounded-md !text-sm"
          onClick={() => showSuccessMessage("备注已保存（只读预览）")}
          type="link"
        >
          保存备注
        </Button>

        <div className="flex items-start gap-2 rounded-md bg-[#f6ffed] p-3 text-xs text-[#389e0d]">
          <InfoCircleOutlined className="mt-0.5 shrink-0" />
          提示：不要领取自己参与的应用，请按流程完成审核。
        </div>
      </Space>
    </Card>
  );
}

function PreviewPanel({ data }: { data: ReviewTaskView }) {
  const items = [
    {
      children: <PreviewOverview data={data} />,
      key: "preview",
      label: "预览详情",
    },
    {
      children: <VersionDiffTab />,
      key: "diff",
      label: "版本差异",
    },
    {
      children: <ValidationDetailTab data={data} />,
      key: "validation",
      label: "自动校验报告",
    },
    {
      children: <RiskTab />,
      key: "risk",
      label: "风险声明",
    },
  ];

  return (
    <Card
      className="rounded-xl border-[#d9d9d9]"
      styles={{ body: { padding: 16 } }}
    >
      <Tabs
        className="review-preview-tabs"
        defaultActiveKey="preview"
        items={items}
        size="small"
      />
    </Card>
  );
}

function PreviewOverview({ data }: { data: ReviewTaskView }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-[#f0f0f0] bg-[#fafafa] p-4 sm:flex-row sm:items-start">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] text-lg font-bold text-white shadow-sm">
          {data.appIconText}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Title
              className="!mb-0 !text-lg !font-semibold !text-[#1f1f1f]"
              level={4}
            >
              {data.appName}
            </Title>
            <Tag color="red">推荐</Tag>
            <Tag color="success">已上架</Tag>
            <Tag color="blue">Web应用</Tag>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#595959]">
            <span className="inline-flex items-center gap-1">
              <StarFilled className="text-[#fa8c16]" />
              <Text className="text-[#1f1f1f]">{data.rating}</Text>
              <Text type="secondary">({data.reviewCount})</Text>
            </span>
            <span className="inline-flex items-center gap-1">
              <HeartOutlined className="text-[#f5222d]" />
              <Text className="text-[#1f1f1f]">{data.likeCount}</Text>
            </span>
            <span>
              所属部门：<Text className="text-[#1f1f1f]">{data.department}</Text>
            </span>
            <span>
              责任人：<Text className="text-[#1f1f1f]">{data.owner}（{data.department}）</Text>
            </span>
          </div>
        </div>
        <Link
          aria-label="查看应用详情"
          className="shrink-0 text-sm"
          href={`/applications/${data.applicationId}`}
        >
          <EyeOutlined /> 查看应用详情
        </Link>
      </div>

      <section>
        <Title className="!mb-3 !text-base !font-medium !text-[#1f1f1f]" level={5}>
          详细介绍
        </Title>
        <Paragraph className="!mb-0 text-sm leading-relaxed text-[#595959]">
          {data.description}
        </Paragraph>
      </section>

      <section>
        <Title className="!mb-3 !text-base !font-medium !text-[#1f1f1f]" level={5}>
          关键特点
        </Title>
        <ul className="m-0 list-none space-y-2 p-0">
          {data.keyFeatures.map((feature) => (
            <li className="flex items-start gap-2 text-sm text-[#595959]" key={feature}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1677ff]" />
              {feature}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Title className="!mb-3 !text-base !font-medium !text-[#1f1f1f]" level={5}>
          截图预览
        </Title>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {data.screenshots.map((shot) => (
            <div
              className="flex h-[120px] w-[200px] shrink-0 flex-col items-center justify-center rounded-lg border border-[#d9d9d9] bg-[#f5f5f5]"
              key={shot.id}
            >
              <FileTextOutlined className="mb-2 text-2xl text-[#bfbfbf]" />
              <Text className="text-xs text-[#8c8c8c]">{shot.alt}</Text>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Title className="!mb-3 !text-base !font-medium !text-[#1f1f1f]" level={5}>
          关键特性
        </Title>
        <ul className="m-0 list-none space-y-2 p-0">
          {data.keyCharacteristics.map((item) => (
            <li className="flex items-start gap-2 text-sm text-[#595959]" key={item}>
              <CheckCircleFilled className="mt-0.5 shrink-0 text-[#52c41a]" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Title className="!mb-3 !text-base !font-medium !text-[#1f1f1f]" level={5}>
          相关附件
        </Title>
        <Space className="w-full" direction="vertical" size={12}>
          {data.attachments.map((file) => (
            <div
              className="flex items-center justify-between rounded-lg border border-[#f0f0f0] bg-white p-3 transition-colors hover:border-[#d9d9d9]"
              key={file.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#f0f7ff] text-[#1677ff]">
                  <FileTextOutlined />
                </div>
                <div className="min-w-0">
                  <Text className="block truncate text-sm text-[#1f1f1f]">
                    {file.name}
                  </Text>
                  <Text className="text-xs text-[#8c8c8c]">
                    {file.size} · {file.date}
                  </Text>
                </div>
              </div>
              <Button
                aria-label={`下载 ${file.name}`}
                icon={<DownloadOutlined aria-hidden="true" />}
                onClick={() => showWarningMessage("下载功能（只读预览）")}
                type="text"
              />
            </div>
          ))}
        </Space>
      </section>
    </div>
  );
}

function VersionDiffTab() {
  return (
    <Empty description="版本差异对比功能即将上线" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  );
}

function ValidationDetailTab({ data }: { data: ReviewTaskView }) {
  return (
    <Space className="w-full" direction="vertical" size={16}>
      <Statistic
        suffix="/ 5"
        title="校验项通过情况"
        value={data.validationChecks.filter((c) => c.status === "passed").length}
      />
      <Timeline
        items={data.validationChecks.map((check) => ({
          children: (
            <div>
              <Text className="text-sm text-[#1f1f1f]">{check.name}</Text>
              <Tag className="ml-2" color={CHECK_META[check.status].color}>
                {CHECK_META[check.status].label}
              </Tag>
              {check.description ? (
                <div className="text-xs text-[#8c8c8c]">{check.description}</div>
              ) : null}
            </div>
          ),
          color: CHECK_META[check.status].color,
        }))}
      />
    </Space>
  );
}

function RiskTab() {
  return (
    <Empty
      description="暂无风险声明"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  );
}

function ReviewHistoryCard({ reviews }: { reviews: ReviewHistoryItem[] }) {
  return (
    <Card
      className="rounded-xl border-[#d9d9d9]"
      styles={{ body: { padding: 16 } }}
      title={
        <span className="text-base font-medium text-[#1f1f1f]">审核意见记录</span>
      }
    >
      {reviews.length === 0 ? (
        <Empty description="暂无审核记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space className="w-full" direction="vertical" size={16}>
          {reviews.map((review) => (
            <div className="flex gap-3" key={review.reviewId}>
              <Avatar className="shrink-0 bg-[#1677ff]">
                {review.reviewerName.slice(0, 1)}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="text-sm font-medium text-[#1f1f1f]">
                    {review.reviewerName}
                  </Text>
                  <Tag color="processing">{review.reviewerDept}</Tag>
                  <Tag color={review.decisionColor}>{review.decisionLabel}</Tag>
                  <Text className="ml-auto text-xs text-[#8c8c8c]">
                    {formatDateTime(review.createdAt)}
                  </Text>
                </div>
                <Paragraph className="!mb-0 !mt-1 text-sm text-[#595959]">
                  {review.comment || "无审核意见"}
                </Paragraph>
              </div>
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
}
