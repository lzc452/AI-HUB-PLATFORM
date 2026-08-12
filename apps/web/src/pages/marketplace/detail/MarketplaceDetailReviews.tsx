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
  Pagination,
  Radio,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import type { UseMutationResult } from "@tanstack/react-query";
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
        {rating.displayAnonymously ? "匿名用户" : rating.employeeId}
      </div>
    </div>
  );
}

function CommentThread({
  comment,
  replies,
  isModerator,
  onHide,
  onRestore,
}: {
  comment: CommentOutput;
  replies: readonly CommentOutput[];
  isModerator: boolean;
  onHide: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const isHidden = comment.hiddenAt !== null;

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
            {comment.displayAnonymously ? "匿名用户" : comment.authorEmployeeId}
            <span>·</span>
            <span>{formatDate(comment.createdAt)}</span>
            {isHidden && (
              <Tag className="!mr-0" color="orange">
                已隐藏
              </Tag>
            )}
          </div>
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
        <p
          className={`!mb-0 text-sm leading-relaxed ${
            isHidden ? "italic text-[#8c8c8c]" : "text-[#1f1f1f]"
          }`}
        >
          {isHidden ? "该评论已被管理员隐藏" : comment.body}
        </p>
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
                  {reply.displayAnonymously
                    ? "匿名用户"
                    : reply.authorEmployeeId}
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

export interface MarketplaceDetailReviewsProps {
  ratings: { items: readonly RatingOutput[]; total: number } | undefined;
  comments: { items: readonly CommentOutput[]; total: number } | undefined;
  ratingsPending: boolean;
  commentsPending: boolean;
  ratingsPage: number;
  commentsPage: number;
  onRatingsPageChange: (page: number) => void;
  onCommentsPageChange: (page: number) => void;
  isModerator: boolean;
  onHideComment: (commentId: string) => void;
  onRestoreComment: (commentId: string) => void;
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
}

/** 评价管理 Tab：评分列表 + 评论列表（含官方回复线程）+ 评论提交 + 应用反馈。 */
export function MarketplaceDetailReviews({
  ratings,
  comments,
  ratingsPending,
  commentsPending,
  ratingsPage,
  commentsPage,
  onRatingsPageChange,
  onCommentsPageChange,
  isModerator,
  onHideComment,
  onRestoreComment,
  createComment,
  createFeedback,
  myFeedback,
}: MarketplaceDetailReviewsProps) {
  const [commentForm] = Form.useForm<{ body: string }>();
  const [feedbackForm] = Form.useForm<{
    type: FeedbackRecord["type"];
    body: string;
  }>();

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
                  comment={root}
                  isModerator={isModerator}
                  key={root.commentId}
                  onHide={onHideComment}
                  onRestore={onRestoreComment}
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
      </section>
    </div>
  );
}
