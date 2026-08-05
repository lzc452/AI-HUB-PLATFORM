import type { DeliveryChannel } from "@ai-hub/contracts";
import { LikeOutlined } from "@ant-design/icons";
import { Alert, Button, Rate, Space, Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import {
  useRateApplication,
  useToggleLike,
} from "../../modules/interaction/useInteraction";
import { useCatalogEntry } from "../../modules/marketplace/useCatalog";

const { Paragraph, Text, Title } = Typography;

const channelMeta: Record<DeliveryChannel, { action: string; title: string }> =
  {
    desktop: { action: "下载已签名安装包", title: "Desktop" },
    mini_program: { action: "展示可解析二维码", title: "Mini-program" },
    mobile: { action: "查看移动端交付", title: "Mobile" },
    web: { action: "打开内网应用", title: "Web" },
  };

export default function MarketplaceDetailPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } = useCatalogEntry(applicationId);
  const toggleLike = useToggleLike(applicationId);
  const rateApplication = useRateApplication(applicationId);

  if (isPending) {
    return <Spin aria-label="应用详情加载中" />;
  }

  if (isError || !data) {
    return (
      <Alert
        description={error?.message ?? "应用不存在或当前员工无权访问。"}
        showIcon
        title="应用详情加载失败"
        type="error"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="marketplace-detail-heading"
        className="space-y-3"
      >
        <Text type="secondary">已发布应用 / 受众权限过滤</Text>
        <Title id="marketplace-detail-heading" level={1} className="!mb-0">
          {data.name}
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          {data.summary}
        </Paragraph>
      </section>
      <section aria-label="应用互动" className="space-y-3">
        <Space size="large" wrap>
          <Button
            disabled={!applicationId}
            icon={<LikeOutlined aria-hidden="true" />}
            loading={toggleLike.isPending}
            onClick={() => toggleLike.mutate()}
          >
            点赞（{data.likeCount}）
          </Button>
          <span>
            <Text type="secondary">综合评分：</Text>
            <Text strong>{data.ratingAverage ?? "暂无"}</Text>
          </span>
          <span>
            <Text type="secondary">我的评分：</Text>
            <Rate
              aria-label="为应用评分"
              disabled={!applicationId || rateApplication.isPending}
              onChange={(stars) => rateApplication.mutate(stars)}
            />
          </span>
        </Space>
        {toggleLike.isError || rateApplication.isError ? (
          <Alert
            description="互动操作失败，请稍后重试。"
            showIcon
            title="操作失败"
            type="error"
          />
        ) : null}
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.deliveryChannels.map((channel) => (
          <div
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
            key={channel}
          >
            <div className="flex items-center justify-between gap-3">
              <Title level={3} className="!mb-0">
                {channelMeta[channel].title}
              </Title>
              <Tag color="success">已启用</Tag>
            </div>
            <Text type="secondary">{channelMeta[channel].action}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}
