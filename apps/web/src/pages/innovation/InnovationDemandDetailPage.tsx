import { zodResolver } from "@hookform/resolvers/zod";
import {
  FlagOutlined,
  LikeFilled,
  LikeOutlined,
  MessageOutlined,
  MoreOutlined,
  PaperClipOutlined,
  SendOutlined,
  SmileOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  Popover,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

import { ErrorBlock } from "../../components/common/ErrorBlock";
import { SkeletonDetail } from "../../components/common/SkeletonDetail";
import {
  demandAudienceText,
  demandStatusColor,
  demandStatusText,
} from "../../modules/innovation/demandMeta";
import {
  useAddDemandComment,
  useDemand,
  useDemandAttachments,
  useDemandComments,
  useLikeDemand,
  useLikeDemandComment,
  useReportDemand,
} from "../../modules/innovation/useDemand";
import { DemandGovernanceDrawer } from "./DemandGovernanceDrawer";
import type { CommentView, DemandView } from "./innovation.types";

const { Paragraph, Text, Title } = Typography;
const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(2, "请输入至少 2 个字")
    .max(5000, "讨论内容不能超过 5000 字"),
});
type CommentFormValues = z.infer<typeof commentSchema>;

function displayAuthor(comment: CommentView) {
  if (comment.displayAnonymously || !comment.authorEmployeeId)
    return "匿名参与者";
  return comment.authorDisplayName ?? comment.authorEmployeeId;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-[#edf0f5] bg-[#fafcff] p-3">
      <Text className="text-xs text-[#8c8c8c]">{label}</Text>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>
        {value ?? "—"}
      </div>
      <Text className="text-xs text-[#bfbfbf]">1–5 分</Text>
    </div>
  );
}

function CommentItem({
  comment,
  onLike,
  onReply,
  onReport,
}: {
  comment: CommentView;
  onLike: () => void;
  onReply: () => void;
  onReport: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#edf0f5] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e6f4ff] text-sm font-semibold text-[#1677ff]">
            {displayAuthor(comment).slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#1f1f1f]">
              {displayAuthor(comment)}
            </div>
            <div className="text-xs text-[#8c8c8c]">
              {comment.authorDepartmentName ?? "创新参与者"} ·{" "}
              {formatDate(comment.createdAt)}
            </div>
          </div>
        </div>
        <Dropdown
          menu={{
            items: [
              {
                key: "report",
                icon: <FlagOutlined />,
                label: "举报评论",
                onClick: onReport,
              },
            ],
          }}
          trigger={["click"]}
        >
          <Button
            aria-label="评论更多操作"
            icon={<MoreOutlined />}
            size="small"
            type="text"
          />
        </Dropdown>
      </div>
      <Paragraph className="!mb-3 !mt-3 whitespace-pre-wrap text-sm leading-6">
        {comment.body}
      </Paragraph>
      <Space size="small">
        <Button
          aria-label={
            comment.likedByCurrentActor ? "取消赞同这条评论" : "赞同这条评论"
          }
          icon={comment.likedByCurrentActor ? <LikeFilled /> : <LikeOutlined />}
          onClick={onLike}
          size="small"
          type="text"
        >
          {comment.likeCount || "赞同"}
        </Button>
        <Button
          icon={<MessageOutlined />}
          onClick={onReply}
          size="small"
          type="text"
        >
          回复
        </Button>
      </Space>
    </div>
  );
}

export default function InnovationDemandDetailPage() {
  const { demandId } = useParams();
  const demandQuery = useDemand(demandId);
  const commentsQuery = useDemandComments(demandId);
  const attachmentsQuery = useDemandAttachments(demandId, true);
  const demand = demandQuery.data as DemandView | undefined;
  const comments = (commentsQuery.data ?? []) as CommentView[];
  const attachments = attachmentsQuery.data ?? [];
  const likeDemand = useLikeDemand(demandId);
  const likeComment = useLikeDemandComment(demandId);
  const addComment = useAddDemandComment(demandId);
  const report = useReportDemand(demandId);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const {
    control,
    formState: { errors },
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm<CommentFormValues>({
    defaultValues: { body: "" },
    resolver: zodResolver(commentSchema),
  });
  const body = watch("body");

  const { roots, repliesByParent } = useMemo(() => {
    const rootComments = comments
      .filter((comment) => !comment.parentCommentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const replyMap = new Map<string, CommentView[]>();
    comments
      .filter((comment) => comment.parentCommentId)
      .forEach((comment) => {
        const list = replyMap.get(comment.parentCommentId as string) ?? [];
        list.push(comment);
        replyMap.set(comment.parentCommentId as string, list);
      });
    replyMap.forEach((list) =>
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
    return { roots: rootComments, repliesByParent: replyMap };
  }, [comments]);

  if (demandQuery.isPending) return <SkeletonDetail />;
  if (demandQuery.isError || !demand)
    return (
      <ErrorBlock
        description={
          demandQuery.error?.message ?? "需求不存在或当前员工无权访问。"
        }
        title="需求详情加载失败"
      />
    );

  const submitComment = handleSubmit((values) => {
    addComment.mutate(
      { body: values.body, parentCommentId: replyingTo },
      {
        onSuccess: () => {
          reset();
          setReplyingTo(null);
        },
      },
    );
  });
  const openReport = (commentId?: string) => {
    const reason = window.prompt("请输入举报原因") ?? "";
    if (!reason.trim()) return;
    report.mutate({ reason: reason.trim(), commentId: commentId ?? null });
  };
  const visibleRoots = showAll ? roots : roots.slice(0, 4);
  const owner = demand.ownerDisplayName ?? demand.ownerEmployeeId ?? "待认领";

  return (
    <div className="space-y-5">
      <nav aria-label="面包屑" className="text-sm text-[#8c8c8c]">
        <Link className="hover:text-[#1677ff]" to="/innovation">
          创新广场
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#1f1f1f]">{demand.title}</span>
      </nav>
      <header className="rounded-2xl border border-[#d6e4ff] bg-[#eaf4ff] px-5 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Tag color={demandStatusColor[demand.status]}>
                {demandStatusText[demand.status]}
              </Tag>
              {demand.displayAnonymously ? <Tag>匿名发起</Tag> : null}
              <Text type="secondary">
                {demand.requesterDepartmentName ?? "创新需求"}
              </Text>
            </div>
            <Title className="!mb-2 !text-3xl lg:!text-4xl" level={1}>
              {demand.title}
            </Title>
            <Text type="secondary">
              最后更新于 {formatDate(demand.updatedAt)}
            </Text>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Dropdown
              menu={{
                items: [
                  {
                    key: "governance",
                    label: "需求治理",
                    onClick: () => setGovernanceOpen(true),
                  },
                  {
                    key: "report",
                    icon: <FlagOutlined />,
                    label: "举报需求",
                    onClick: () => openReport(),
                  },
                ],
              }}
              trigger={["click"]}
            >
              <Button
                aria-label="更多需求操作"
                icon={<MoreOutlined />}
                size="large"
                type="text"
              />
            </Dropdown>
            <Button
              aria-label={demand.likedByCurrentActor ? "取消点赞" : "点赞"}
              className="min-w-28"
              icon={
                demand.likedByCurrentActor ? <LikeFilled /> : <LikeOutlined />
              }
              loading={likeDemand.isPending}
              onClick={() => likeDemand.mutate()}
              size="large"
              type="primary"
            >
              点赞 {demand.likeCount}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]">
        <main className="space-y-5">
          <Card className="rounded-2xl border-[#edf0f5]" title="当前问题">
            <Paragraph className="!mb-0 whitespace-pre-wrap leading-7">
              {demand.problemStatement}
            </Paragraph>
          </Card>
          {demand.businessScenario ? (
            <Card className="rounded-2xl border-[#edf0f5]" title="业务场景与当前流程">
              <Paragraph className="!mb-0 whitespace-pre-wrap leading-7">
                {demand.businessScenario}
              </Paragraph>
            </Card>
          ) : null}
          {demand.impact ? (
            <Card className="rounded-2xl border-[#edf0f5]" title="影响对象、发生频率与耗时">
              <Paragraph className="!mb-0 whitespace-pre-wrap leading-7">
                {demand.impact}
              </Paragraph>
            </Card>
          ) : null}
          <Card className="rounded-2xl border-[#edf0f5]" title="期望结果">
            <Paragraph className="!mb-0 whitespace-pre-wrap leading-7">
              {demand.desiredOutcome}
            </Paragraph>
          </Card>
          {demand.currentWorkaround ? (
            <Card className="rounded-2xl border-[#edf0f5]" title="当前替代方案">
              <Paragraph className="!mb-0 whitespace-pre-wrap leading-7">
                {demand.currentWorkaround}
              </Paragraph>
            </Card>
          ) : null}
          {demand.dataSensitivity ? (
            <Card className="rounded-2xl border-[#edf0f5]" title="数据类型与敏感程度">
              <Paragraph className="!mb-0 whitespace-pre-wrap leading-7">
                {demand.dataSensitivity}
              </Paragraph>
            </Card>
          ) : null}
          {demand.aiSolutionIdea ? (
            <Card className="rounded-2xl border-[#edf0f5]" title="AI 方案设想">
              <Paragraph className="!mb-0 whitespace-pre-wrap leading-7">
                {demand.aiSolutionIdea}
              </Paragraph>
            </Card>
          ) : null}
          <Card className="rounded-2xl border-[#edf0f5]" title="优先级评估">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Metric
                label="业务价值"
                tone="text-[#1677ff]"
                value={demand.businessValue}
              />
              <Metric
                label="影响人数"
                tone="text-[#1677ff]"
                value={demand.impactedHeadcount}
              />
              <Metric
                label="使用频率"
                tone="text-[#1677ff]"
                value={demand.usageFrequency}
              />
              <Metric
                label="战略匹配度"
                tone="text-[#722ed1]"
                value={demand.strategicFit}
              />
              <Metric
                label="技术可行性"
                tone="text-[#595959]"
                value={demand.technicalFeasibility}
              />
              <Metric
                label="数据合规风险"
                tone="text-[#ff7a45]"
                value={demand.dataComplianceRisk}
              />
              <Metric
                label="实施成本"
                tone="text-[#595959]"
                value={demand.implementationCost}
              />
            </div>
            {demand.priorityScore !== null &&
            demand.priorityScore !== undefined ? (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f7faff] px-4 py-3">
                <Text type="secondary">系统建议分</Text>
                <Text className="text-xl font-semibold text-[#1677ff]">
                  {demand.priorityScore.toFixed(1)} / 5.0
                </Text>
              </div>
            ) : null}
            {demand.confirmedPriority ? (
              <div className="mt-3 rounded-xl border border-[#edf0f5] px-4 py-3">
                <div className="flex items-center justify-between">
                  <Text type="secondary">运营确认优先级</Text>
                  <Tag
                    color={
                      demand.confirmedPriority === "high"
                        ? "red"
                        : demand.confirmedPriority === "medium"
                          ? "orange"
                          : "default"
                    }
                  >
                    {demand.confirmedPriority === "high"
                      ? "高"
                      : demand.confirmedPriority === "medium"
                        ? "中"
                        : "低"}
                  </Tag>
                </div>
                {demand.priorityAdjustmentReason ? (
                  <Text className="mt-1 block text-xs" type="secondary">
                    调整原因：{demand.priorityAdjustmentReason}
                  </Text>
                ) : null}
              </div>
            ) : null}
          </Card>
          <Card className="rounded-2xl border-[#edf0f5]" title="需求信息">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <Text type="secondary">可见范围</Text>
                <div className="mt-1 font-medium">
                  {demand.displayAnonymously
                    ? "匿名展示"
                    : demandAudienceText[demand.audienceType]}
                </div>
              </div>
              <div>
                <Text type="secondary">负责人</Text>
                <div className="mt-1 font-medium">{owner}</div>
              </div>
              <div>
                <Text type="secondary">创建时间</Text>
                <div className="mt-1 font-medium">
                  {formatDate(demand.createdAt)}
                </div>
              </div>
              <div>
                <Text type="secondary">更新时间</Text>
                <div className="mt-1 font-medium">
                  {formatDate(demand.updatedAt)}
                </div>
              </div>
            </div>
          </Card>
          <Card
            className="rounded-2xl border-[#edf0f5]"
            title={`附件 (${attachments.length})`}
          >
            {attachments.length ? (
              <ul className="space-y-2 text-sm">
                {attachments.map((item) => (
                  <li
                    className="flex items-center justify-between gap-3"
                    key={item.attachmentId}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <PaperClipOutlined className="text-[#8c8c8c]" />
                      <span className="truncate">{item.fileName}</span>
                    </span>
                    <Text className="shrink-0" type="secondary">
                      {formatSize(item.sizeBytes)}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : (
              <Text type="secondary">暂无附件</Text>
            )}
          </Card>
          <Card className="rounded-2xl border-[#edf0f5]" title="治理说明">
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#595959]">
              <li>讨论支持文字、Emoji 与一级回复，不展示图片附件。</li>
              <li>举报、匿名追溯与状态推进会写入审计记录。</li>
              <li>需求治理操作入口位于标题右侧“更多”。</li>
            </ul>
          </Card>
        </main>
        <aside className="min-w-0">
          <Card
            className="rounded-2xl border-[#edf0f5]"
            title={
              <div className="flex items-center justify-between">
                <span>
                  补充讨论 <Text type="secondary">({demand.commentCount})</Text>
                </span>
                <Text className="text-xs" type="secondary">
                  根讨论按最新
                </Text>
              </div>
            }
          >
            <div className="space-y-3">
              {commentsQuery.isPending ? (
                <div className="py-8 text-center">
                  <Spin aria-label="讨论加载中" />
                </div>
              ) : null}
              {!commentsQuery.isPending && roots.length === 0 ? (
                <Empty description="暂无讨论，欢迎补充第一条意见" />
              ) : null}
              {visibleRoots.map((comment) => (
                <div key={comment.commentId} className="space-y-2">
                  <CommentItem
                    comment={comment}
                    onLike={() => likeComment.mutate(comment.commentId)}
                    onReply={() => setReplyingTo(comment.commentId)}
                    onReport={() => openReport(comment.commentId)}
                  />
                  {(repliesByParent.get(comment.commentId) ?? []).map(
                    (reply) => (
                      <div className="ml-8" key={reply.commentId}>
                        <CommentItem
                          comment={reply}
                          onLike={() => likeComment.mutate(reply.commentId)}
                          onReply={() => setReplyingTo(comment.commentId)}
                          onReport={() => openReport(reply.commentId)}
                        />
                      </div>
                    ),
                  )}
                  {replyingTo === comment.commentId ? (
                    <div className="ml-8 rounded-xl bg-[#f7faff] p-3 text-xs text-[#595959]">
                      正在回复 {displayAuthor(comment)}
                      <Button
                        className="ml-2"
                        onClick={() => setReplyingTo(null)}
                        size="small"
                        type="link"
                      >
                        取消
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {roots.length > 4 ? (
                <Button
                  block
                  onClick={() => setShowAll((value) => !value)}
                  type="link"
                >
                  {showAll ? "收起讨论" : `展开全部 ${roots.length} 条讨论`}
                </Button>
              ) : null}
            </div>
            <Divider />
            <form aria-label="讨论表单" noValidate onSubmit={submitComment}>
              <Form.Item
                help={errors.body?.message ?? ""}
                validateStatus={errors.body ? "error" : ""}
              >
                <Controller
                  control={control}
                  name="body"
                  render={({ field }) => (
                    <Input.TextArea
                      {...field}
                      aria-label="讨论内容"
                      autoSize={{ minRows: 4, maxRows: 8 }}
                      placeholder={
                        replyingTo ? "回复这条讨论" : "补充你的建议或疑问"
                      }
                      showCount
                    />
                  )}
                />
              </Form.Item>
              <div className="flex items-center justify-between gap-2">
                <Popover
                  content={
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        "😀",
                        "👍",
                        "💡",
                        "🎯",
                        "🚀",
                        "✅",
                        "🤝",
                        "🙌",
                        "❤️",
                        "✨",
                      ].map((emoji) => (
                        <Button
                          aria-label={emoji}
                          key={emoji}
                          onClick={() => {
                            setValue("body", `${body}${emoji}`);
                            setEmojiOpen(false);
                          }}
                          size="small"
                          type="text"
                        >
                          {emoji}
                        </Button>
                      ))}
                    </div>
                  }
                  onOpenChange={setEmojiOpen}
                  open={emojiOpen}
                  trigger="click"
                >
                  <Button
                    aria-label="添加 Emoji"
                    icon={<SmileOutlined />}
                    type="text"
                  />
                </Popover>
                <Button
                  htmlType="submit"
                  icon={<SendOutlined />}
                  loading={addComment.isPending}
                  type="primary"
                >
                  {replyingTo ? "发表回复" : "发表讨论"}
                </Button>
              </div>
            </form>
          </Card>
        </aside>
      </div>
      {governanceOpen ? (
        <DemandGovernanceDrawer
          demand={demand}
          onClose={() => setGovernanceOpen(false)}
          open={governanceOpen}
        />
      ) : null}
    </div>
  );
}
