import type { CommentOutput, RatingOutput } from "@ai-hub/contracts";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  MessageOutlined,
  StarFilled,
  UserOutlined,
} from "@ant-design/icons";
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Radio,
  Select,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import {
  type CommentOutputExt,
  type FeedbackRecord,
} from "../../../modules/interaction/interaction.client";

const { Text, Title } = Typography;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * 作者展示（规格 §5.7）：匿名评论保持"匿名用户"（匿名身份不暴露，即使作者已停用）；
 * 实名评论作者为停用/归档员工时显示"已停用用户"灰标签，不暴露工号。
 */
function AuthorDisplay({
  authorStatus,
  displayAnonymously,
  employeeId,
}: {
  authorStatus: CommentOutput["authorStatus"];
  displayAnonymously: boolean;
  employeeId: string;
}) {
  if (displayAnonymously) return <span>匿名用户</span>;
  if (authorStatus === "disabled" || authorStatus === "archived") {
    return (
      <Tag className="!mr-0" color="default">
        已停用用户
      </Tag>
    );
  }
  return <span>{employeeId}</span>;
}

function RatingCard({ rating }: { rating: RatingOutput }) {
  return (
    <div className="rounded-xl border border-[#f0f0f0] bg-[#fafafa] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex">
          {Array.from({ length: 5 }, (_, i) => (
            <StarFilled
              key={i}
              className={i < rating.stars ? "text-[#faad14]" : "text-[#e8e8e8]"}
              style={{ fontSize: 16 }}
            />
          ))}
        </span>
        <Text type="secondary" className="!text-xs">
          {formatDate(rating.createdAt)}
        </Text>
      </div>
      {rating.body && (
        <p className="!mb-0 text-sm leading-relaxed text-[#1f1f1f]">
          {rating.body}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1 text-xs text-[#8c8c8c]">
        <UserOutlined />
        <AuthorDisplay
          authorStatus={rating.authorStatus}
          displayAnonymously={rating.displayAnonymously}
          employeeId={rating.employeeId}
        />
      </div>
    </div>
  );
}

function CommentThread({
  canReplyOfficial,
  comment,
  isModerator,
  onHide,
  onReport,
  onReplyCancel,
  onReplyChange,
  onReplyStart,
  onReplySubmit,
  onRestore,
  replies,
  replyDraft,
  replyPending,
  replyTargetId,
}: {
  canReplyOfficial: boolean;
  comment: CommentOutput;
  isModerator: boolean;
  onHide: (id: string) => void;
  onReport: (id: string) => void;
  onReplyCancel: () => void;
  onReplyChange: (value: string) => void;
  onReplyStart: (id: string) => void;
  onReplySubmit: (body: string) => void;
  onRestore: (id: string) => void;
  replies: readonly CommentOutput[];
  replyDraft: string;
  replyPending: boolean;
  replyTargetId: string | null;
}) {
  const isHidden = comment.hiddenAt !== null;
  const isReplying = replyTargetId === comment.commentId;

  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl border p-4 ${
          isHidden
            ? "border-[#ffd8bf] bg-[#fff7e6]"
            : "border-[#f0f0f0] bg-white"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-[#8c8c8c]">
            <UserOutlined />
            <AuthorDisplay
              authorStatus={comment.authorStatus}
              displayAnonymously={comment.displayAnonymously}
              employeeId={comment.authorEmployeeId}
            />
            <span>·</span>
            <span>{formatDate(comment.createdAt)}</span>
            {isHidden && (
              <Tag className="!mr-0" color="orange">
                已隐藏
              </Tag>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={`举报 ${comment.commentId}`}
              onClick={() => onReport(comment.commentId)}
              size="small"
              type="link"
            >
              举报
            </Button>
            {isModerator && (
              <Button
                danger={!isHidden}
                icon={isHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={() =>
                  isHidden
                    ? onRestore(comment.commentId)
                    : onHide(comment.commentId)
                }
                size="small"
                type="link"
              >
                {isHidden ? "恢复" : "隐藏"}
              </Button>
            )}
          </div>
        </div>
        <p
          className={`!mb-0 text-sm leading-relaxed ${
            isHidden ? "italic text-[#8c8c8c]" : "text-[#1f1f1f]"
          }`}
        >
          {isHidden ? "该评论已被管理员隐藏" : comment.body}
        </p>
        {isReplying ? (
          <div className="mt-3 space-y-2">
            <Input.TextArea
              aria-label="官方回复内容"
              autoSize={{ minRows: 2, maxRows: 4 }}
              maxLength={500}
              onChange={(event) => onReplyChange(event.target.value)}
              placeholder="输入官方回复…"
              value={replyDraft}
            />
            <div className="flex justify-end gap-2">
              <Button onClick={onReplyCancel} size="small">
                取消
              </Button>
              <Button
                loading={replyPending}
                onClick={() => onReplySubmit(replyDraft)}
                size="small"
                type="primary"
              >
                发送回复
              </Button>
            </div>
          </div>
        ) : canReplyOfficial ? (
          <Button
            aria-label={`回复 ${comment.commentId}`}
            className="mt-2 px-0"
            onClick={() => onReplyStart(comment.commentId)}
            size="small"
            type="link"
          >
            回复
          </Button>
        ) : null}
      </div>
      {replies.length > 0 && (
        <div className="ml-8 space-y-2 border-l-2 border-[#e6f4ff] pl-4">
          {replies.map((reply) => (
            <div
              className={`rounded-lg border p-3 ${
                reply.hiddenAt
                  ? "border-[#ffd8bf] bg-[#fff7e6]"
                  : "border-[#f0f0f0] bg-[#fafafa]"
              }`}
              key={reply.commentId}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-[#8c8c8c]">
                  <UserOutlined />
                  <AuthorDisplay
                    authorStatus={reply.authorStatus}
                    displayAnonymously={reply.displayAnonymously}
                    employeeId={reply.authorEmployeeId}
                  />
                  <span>·</span>
                  <Tag className="!mr-0" color="blue">
                    官方回复
                  </Tag>
                  {reply.hiddenAt && (
                    <Tag className="!mr-0" color="orange">
                      已隐藏
                    </Tag>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label={`举报 ${reply.commentId}`}
                    onClick={() => onReport(reply.commentId)}
                    size="small"
                    type="link"
                  >
                    举报
                  </Button>
                  {isModerator && (
                    <Button
                      danger={!reply.hiddenAt}
                      icon={
                        reply.hiddenAt ? (
                          <EyeOutlined />
                        ) : (
                          <EyeInvisibleOutlined />
                        )
                      }
                      onClick={() =>
                        reply.hiddenAt
                          ? onRestore(reply.commentId)
                          : onHide(reply.commentId)
                      }
                      size="small"
                      type="link"
                    >
                      {reply.hiddenAt ? "恢复" : "隐藏"}
                    </Button>
                  )}
                </div>
              </div>
              <p
                className={`!mb-0 text-sm ${
                  reply.hiddenAt ? "italic text-[#8c8c8c]" : "text-[#1f1f1f]"
                }`}
              >
                {reply.hiddenAt ? "该评论已被管理员隐藏" : reply.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const feedbackTypeText: Record<FeedbackRecord["type"], string> = {
  bug: "问题反馈",
  suggestion: "优化建议",
  content_issue: "内容问题",
};

const feedbackStatusText: Record<FeedbackRecord["status"], string> = {
  open: "待处理",
  in_progress: "处理中",
  resolved: "已解决",
  closed: "已关闭",
};

const feedbackStatusOptions = (
  Object.keys(feedbackStatusText) as FeedbackRecord["status"][]
).map((status) => ({ label: feedbackStatusText[status], value: status }));

function OwnerFeedbackItem({
  feedback,
  onSave,
  pending,
}: {
  feedback: FeedbackRecord;
  onSave: (
    feedbackId: string,
    status: FeedbackRecord["status"],
    resolution: string,
  ) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<FeedbackRecord["status"]>(
    feedback.status,
  );
  const [resolution, setResolution] = useState(feedback.resolution ?? "");

  return (
    <div className="rounded-lg border border-[#f0f0f0] bg-[#fafafa] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Tag color="geekblue">{feedbackTypeText[feedback.type]}</Tag>
          <span className="ml-1 text-xs text-[#8c8c8c]">
            {feedback.creatorEmployeeId}
          </span>
        </div>
        <Tag color="green">{feedbackStatusText[feedback.status]}</Tag>
      </div>
      <p className="!mb-2 text-sm text-[#1f1f1f]">{feedback.body}</p>
      <div className="flex items-start gap-2">
        <Select
          aria-label="反馈处理状态"
          onChange={(next) => setStatus(next)}
          options={feedbackStatusOptions}
          size="small"
          style={{ width: 110 }}
          value={status}
        />
        <Input
          aria-label="反馈处理说明"
          maxLength={500}
          onChange={(event) => setResolution(event.target.value)}
          placeholder="处理说明（终态必填）"
          size="small"
          value={resolution}
        />
        <Button
          loading={pending}
          onClick={() => onSave(feedback.feedbackId, status, resolution)}
          size="small"
          type="primary"
        >
          保存
        </Button>
      </div>
    </div>
  );
}

export interface MarketplaceDetailReviewsProps {
  applicationFeedback: readonly FeedbackRecord[] | undefined;
  ratings: { items: readonly RatingOutput[]; total: number } | undefined;
  comments: { items: readonly CommentOutput[]; total: number } | undefined;
  ratingsPending: boolean;
  commentsPending: boolean;
  ratingsPage: number;
  commentsPage: number;
  onRatingsPageChange: (page: number) => void;
  onCommentsPageChange: (page: number) => void;
  canReplyOfficial: boolean;
  isModerator: boolean;
  onHideComment: (commentId: string) => void;
  onRestoreComment: (commentId: string) => void;
  reportComment: UseMutationResult<
    unknown,
    unknown,
    { commentId: string; reason: string }
  >;
  createComment: UseMutationResult<
    CommentOutputExt,
    unknown,
    { parentCommentId?: string | null; body: string }
  >;
  createFeedback: UseMutationResult<
    FeedbackRecord,
    unknown,
    { type: FeedbackRecord["type"]; body: string }
  >;
  myFeedback: readonly FeedbackRecord[] | undefined;
  updateFeedback: UseMutationResult<
    FeedbackRecord,
    unknown,
    { feedbackId: string; status: FeedbackRecord["status"]; resolution: string }
  >;
}

/** 评价管理 Tab：评分列表 + 评论列表（含官方回复线程）+ 评论提交 + 应用反馈。 */
export function MarketplaceDetailReviews({
  applicationFeedback,
  ratings,
  comments,
  ratingsPending,
  commentsPending,
  ratingsPage,
  commentsPage,
  onRatingsPageChange,
  onCommentsPageChange,
  canReplyOfficial,
  isModerator,
  onHideComment,
  onRestoreComment,
  reportComment,
  createComment,
  createFeedback,
  myFeedback,
  updateFeedback,
}: MarketplaceDetailReviewsProps) {
  const [commentForm] = Form.useForm<{ body: string }>();
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [feedbackForm] = Form.useForm<{
    type: FeedbackRecord["type"];
    body: string;
  }>();
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportForm] = Form.useForm<{ reason: string }>();

  const ratingsPageSize = 10;
  const commentsPageSize = 10;

  // Group comments into roots and replies
  const rootComments =
    comments?.items.filter((c) => c.parentCommentId === null) ?? [];
  const repliesByParent = new Map<string, CommentOutput[]>();
  for (const c of comments?.items ?? []) {
    if (c.parentCommentId !== null) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  }

  const handleSubmitComment = async () => {
    const values = await commentForm.validateFields();
    if (!values.body.trim()) return;
    await createComment.mutateAsync({ body: values.body.trim() });
    commentForm.resetFields();
  };

  const handleSubmitFeedback = async () => {
    const values = await feedbackForm.validateFields();
    await createFeedback.mutateAsync({
      type: values.type,
      body: values.body.trim(),
    });
    feedbackForm.resetFields();
  };

  const handleSubmitReply = async (body: string) => {
    if (!replyTargetId || !body.trim()) return;
    await createComment.mutateAsync({
      parentCommentId: replyTargetId,
      body: body.trim(),
    });
    setReplyTargetId(null);
    setReplyDraft("");
  };

  const handleSubmitReport = async () => {
    if (!reportTargetId) return;
    try {
      const values = await reportForm.validateFields();
      // 失败时错误提示由 useReportComment 处理，弹窗保持打开便于修改重试。
      await reportComment.mutateAsync({
        commentId: reportTargetId,
        reason: values.reason.trim(),
      });
    } catch {
      return;
    }
    setReportTargetId(null);
    reportForm.resetFields();
  };

  const closeReportModal = () => {
    setReportTargetId(null);
    reportForm.resetFields();
  };

  return (
    <div className="space-y-6">
      {/* 评论提交表单 */}
      <section className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6">
        <Title level={2} className="!mb-2 !text-lg">
          <MessageOutlined className="mr-2" />
          发表评论
        </Title>
        <Form form={commentForm} layout="vertical" name="create-comment">
          <Form.Item
            name="body"
            rules={[{ required: true, message: "请输入评论内容" }]}
          >
            <Input.TextArea
              maxLength={500}
              placeholder="分享你的使用体验或提出问题…"
              rows={3}
            />
          </Form.Item>
          <div className="flex justify-end">
            <Button
              loading={createComment.isPending}
              onClick={() => void handleSubmitComment()}
              type="primary"
            >
              发表评论
            </Button>
          </div>
        </Form>
      </section>

      {/* Ratings Section */}
      <section
        aria-label="用户评分"
        className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <Title level={2} className="!mb-0 !text-lg">
            <StarFilled className="mr-2 text-[#faad14]" />
            用户评分
            {ratings && (
              <Text type="secondary" className="!ml-2 !text-sm !font-normal">
                （{ratings.total}）
              </Text>
            )}
          </Title>
        </div>

        {ratingsPending ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : ratings && ratings.items.length > 0 ? (
          <>
            <div className="space-y-3">
              {ratings.items.map((rating) => (
                <RatingCard key={rating.ratingId} rating={rating} />
              ))}
            </div>
            {ratings.total > ratingsPageSize && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  current={ratingsPage}
                  onChange={onRatingsPageChange}
                  pageSize={ratingsPageSize}
                  size="small"
                  total={ratings.total}
                />
              </div>
            )}
          </>
        ) : (
          <Empty description="暂无评分" />
        )}
      </section>

      {/* Comments Section */}
      <section
        aria-label="用户评论"
        className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <Title level={2} className="!mb-0 !text-lg">
            <MessageOutlined className="mr-2" />
            用户评论
            {comments && (
              <Text type="secondary" className="!ml-2 !text-sm !font-normal">
                （{comments.total}）
              </Text>
            )}
          </Title>
        </div>

        {commentsPending ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : rootComments.length > 0 ? (
          <>
            <div className="space-y-4">
              {rootComments.map((root) => (
                <CommentThread
                  canReplyOfficial={canReplyOfficial}
                  comment={root}
                  isModerator={isModerator}
                  key={root.commentId}
                  onHide={onHideComment}
                  onReport={setReportTargetId}
                  onReplyCancel={() => {
                    setReplyTargetId(null);
                    setReplyDraft("");
                  }}
                  onReplyChange={setReplyDraft}
                  onReplyStart={(id) => {
                    setReplyTargetId(id);
                    setReplyDraft("");
                  }}
                  onReplySubmit={(body) => void handleSubmitReply(body)}
                  onRestore={onRestoreComment}
                  replyDraft={replyDraft}
                  replyPending={createComment.isPending}
                  replyTargetId={replyTargetId}
                  replies={repliesByParent.get(root.commentId) ?? []}
                />
              ))}
            </div>
            {comments && comments.total > commentsPageSize && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  current={commentsPage}
                  onChange={onCommentsPageChange}
                  pageSize={commentsPageSize}
                  size="small"
                  total={comments.total}
                />
              </div>
            )}
          </>
        ) : (
          <Empty description="暂无评论" />
        )}
      </section>

      {/* Feedback Section */}
      <section
        aria-label="应用反馈"
        className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
      >
        <Title level={2} className="!mb-2 !text-lg">
          <MessageOutlined className="mr-2" />
          应用反馈
        </Title>
        <Form form={feedbackForm} layout="vertical" name="create-feedback">
          <Form.Item
            initialValue="suggestion"
            name="type"
            rules={[{ required: true }]}
          >
            <Radio.Group
              options={[
                { label: "问题反馈", value: "bug" },
                { label: "优化建议", value: "suggestion" },
                { label: "内容问题", value: "content_issue" },
              ]}
              optionType="button"
            />
          </Form.Item>
          <Form.Item
            name="body"
            rules={[{ required: true, message: "请输入反馈内容" }]}
          >
            <Input.TextArea
              maxLength={1000}
              placeholder="告诉我们哪里可以做得更好…"
              rows={3}
            />
          </Form.Item>
          <div className="flex justify-end">
            <Button
              loading={createFeedback.isPending}
              onClick={() => void handleSubmitFeedback()}
              type="primary"
            >
              提交反馈
            </Button>
          </div>
        </Form>

        {myFeedback && myFeedback.length > 0 ? (
          <div className="mt-4 space-y-2">
            {myFeedback.map((item) => (
              <div
                className="flex items-start gap-3 rounded-lg border border-[#f0f0f0] bg-[#fafafa] p-3"
                key={item.feedbackId}
              >
                <Tag className="!mt-0.5" color="geekblue">
                  {feedbackTypeText[item.type]}
                </Tag>
                <div className="min-w-0 flex-1">
                  <p className="!mb-1 text-sm text-[#1f1f1f]">{item.body}</p>
                  <div className="text-xs text-[#8c8c8c]">
                    状态：
                    <Tag
                      className="!mr-0"
                      color={
                        item.status === "resolved" || item.status === "closed"
                          ? "success"
                          : "processing"
                      }
                    >
                      {feedbackStatusText[item.status]}
                    </Tag>
                    {item.resolution ? (
                      <span className="ml-2">处理说明：{item.resolution}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {canReplyOfficial &&
        applicationFeedback &&
        applicationFeedback.length > 0 ? (
          <div className="mt-4 space-y-2">
            <Title level={3} className="!mb-2 !text-base">
              反馈管理
            </Title>
            {applicationFeedback.map((item) => (
              <OwnerFeedbackItem
                feedback={item}
                key={item.feedbackId}
                onSave={(feedbackId, status, resolution) =>
                  updateFeedback.mutate({ feedbackId, status, resolution })
                }
                pending={updateFeedback.isPending}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* 评论举报弹窗 */}
      <Modal
        cancelText="取消"
        confirmLoading={reportComment.isPending}
        okText="提交举报"
        onCancel={closeReportModal}
        onOk={() => void handleSubmitReport()}
        open={reportTargetId !== null}
        title="举报评论"
      >
        <Form form={reportForm} layout="vertical" name="report-comment">
          <Form.Item
            label="举报原因"
            name="reason"
            rules={[{ required: true, message: "请填写举报原因" }]}
          >
            <Input.TextArea
              autoFocus
              maxLength={500}
              placeholder="请描述举报原因，例如：包含不当内容、恶意攻击等…"
              rows={4}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
