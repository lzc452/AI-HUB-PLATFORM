import type { CommentOutput, RatingOutput } from "@ai-hub/contracts";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  MessageOutlined,
  StarFilled,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Empty, Pagination, Skeleton, Tag, Typography } from "antd";
import { useState } from "react";

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
            {comment.displayAnonymously
              ? "匿名用户"
              : comment.authorEmployeeId}
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
                isHidden ? onRestore(comment.commentId) : onHide(comment.commentId)
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
                      reply.hiddenAt ? <EyeOutlined /> : <EyeInvisibleOutlined />
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
                  reply.hiddenAt
                    ? "italic text-[#8c8c8c]"
                    : "text-[#1f1f1f]"
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

export interface MarketplaceDetailReviewsProps {
  ratings:
    | { items: readonly RatingOutput[]; total: number }
    | undefined;
  comments:
    | { items: readonly CommentOutput[]; total: number }
    | undefined;
  ratingsPending: boolean;
  commentsPending: boolean;
  isModerator: boolean;
  onHideComment: (commentId: string) => void;
  onRestoreComment: (commentId: string) => void;
}

/** 评价管理 Tab：评分列表 + 评论列表（含官方回复线程）。 */
export function MarketplaceDetailReviews({
  ratings,
  comments,
  ratingsPending,
  commentsPending,
  isModerator,
  onHideComment,
  onRestoreComment,
}: MarketplaceDetailReviewsProps) {
  const [ratingsPage, setRatingsPage] = useState(1);
  const [commentsPage, setCommentsPage] = useState(1);

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

  return (
    <div className="space-y-6">
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
                  onChange={setRatingsPage}
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
                  onChange={setCommentsPage}
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
    </div>
  );
}
