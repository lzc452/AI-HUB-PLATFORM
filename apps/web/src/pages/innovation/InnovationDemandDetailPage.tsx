import { zodResolver } from "@hookform/resolvers/zod";
import { LikeOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input, Spin, Tag, Typography } from "antd";
import { Controller, useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import { z } from "zod";

import {
  demandStatusColor,
  demandStatusText,
} from "../../modules/innovation/demandMeta";
import {
  useAddDemandComment,
  useDemand,
  useDemandComments,
  useLikeDemand,
} from "../../modules/innovation/useDemand";

const { Paragraph, Text, Title } = Typography;

const commentSchema = z.object({
  body: z.string().trim().min(1, "请输入讨论内容").max(500, "讨论内容不能超过 500 字"),
});

type CommentFormValues = z.infer<typeof commentSchema>;

export default function InnovationDemandDetailPage() {
  const { demandId } = useParams();
  const { data, error, isError, isPending } = useDemand(demandId);
  const comments = useDemandComments(demandId);
  const likeDemand = useLikeDemand(demandId);
  const addComment = useAddDemandComment(demandId);

  const {
    control,
    formState: { errors },
    handleSubmit,
    reset,
  } = useForm<CommentFormValues>({
    defaultValues: { body: "" },
    resolver: zodResolver(commentSchema),
  });

  const onSubmit = handleSubmit((values) => {
    addComment.mutate(values.body, {
      onSuccess: () => reset(),
    });
  });

  if (isPending) {
    return <Spin aria-label="需求详情加载中" />;
  }

  if (isError || !data) {
    return (
      <Alert
        description={error?.message ?? "需求不存在或当前员工无权访问。"}
        showIcon
        title="需求详情加载失败"
        type="error"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="demand-detail-heading" className="space-y-3">
        <Text type="secondary">Phase 5 / 受众过滤详情</Text>
        <Title id="demand-detail-heading" level={1} className="!mb-0">
          {data.title}
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          {data.demandId} · 需求身份在匿名展示时保留在受控审计记录中。
        </Paragraph>
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5 lg:col-span-2">
          <Title level={2} className="!mb-3">
            需求说明
          </Title>
          <Paragraph>{data.problemStatement}</Paragraph>
          <Paragraph>{data.desiredOutcome}</Paragraph>
          <div className="flex flex-wrap gap-2">
            <Tag color={demandStatusColor[data.status]}>
              {demandStatusText[data.status]}
            </Tag>
            {data.displayAnonymously ? <Tag>匿名展示</Tag> : null}
            <Tag>受众已过滤</Tag>
          </div>
        </section>
        <aside className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <Title level={3} className="!mb-3">
            互动与治理
          </Title>
          <div className="space-y-3">
            <Button
              disabled={!demandId}
              icon={<LikeOutlined aria-hidden="true" />}
              loading={likeDemand.isPending}
              onClick={() => likeDemand.mutate()}
            >
              点赞（{data.likeCount}）
            </Button>
            <ul className="m-0 space-y-2 pl-5">
              <li>补充讨论（最多一级回复）</li>
              <li>举报与状态化处理</li>
              <li>管理员追溯需授权并审计</li>
            </ul>
          </div>
        </aside>
      </div>
      <section
        aria-labelledby="demand-comments-heading"
        className="space-y-4 rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
      >
        <Title id="demand-comments-heading" level={2} className="!mb-0">
          补充讨论（{data.commentCount}）
        </Title>
        {comments.data?.length ? (
          <ul className="m-0 list-none space-y-3 p-0">
            {comments.data.map((comment) => (
              <li
                className="rounded-md border border-solid border-[#f0f0f0] p-3"
                key={comment.commentId}
              >
                <Paragraph className="!mb-1">{comment.body}</Paragraph>
                <Text type="secondary" className="text-xs">
                  {comment.displayAnonymously || !comment.authorEmployeeId
                    ? "匿名"
                    : comment.authorEmployeeId}
                </Text>
              </li>
            ))}
          </ul>
        ) : (
          <Text type="secondary">暂无讨论，欢迎补充第一条意见。</Text>
        )}
        <form aria-label="讨论表单" noValidate onSubmit={onSubmit}>
          <Form.Item
            help={errors.body?.message}
            validateStatus={errors.body ? "error" : ""}
          >
            <Controller
              control={control}
              name="body"
              render={({ field }) => (
                <Input.TextArea
                  {...field}
                  aria-label="讨论内容"
                  placeholder="补充你的建议或疑问"
                  rows={3}
                />
              )}
            />
          </Form.Item>
          <Button
            htmlType="submit"
            loading={addComment.isPending}
            type="primary"
          >
            发表讨论
          </Button>
        </form>
        {addComment.isError ? (
          <Alert
            className="!mt-3"
            description="讨论提交失败，请稍后重试。"
            showIcon
            title="提交失败"
            type="error"
          />
        ) : null}
      </section>
    </div>
  );
}
