import type { DeliveryChannel } from "@ai-hub/contracts";
import { LikeOutlined } from "@ant-design/icons";
import { Alert, Button, Rate, Space, Tag, Typography } from "antd";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { ErrorBlock } from "../../components/common/ErrorBlock";
import { NotFoundBlock } from "../../components/common/NotFoundBlock";
import { PageHeader } from "../../components/common/PageHeader";
import { SkeletonDetail } from "../../components/common/SkeletonDetail";
import { rememberLastViewedApplicationId } from "../../modules/application/last-viewed";
import {
  useRateApplication,
  useToggleLike,
} from "../../modules/interaction/useInteraction";
import { useCatalogEntry } from "../../modules/marketplace/useCatalog";

const { Text, Title } = Typography;

const channelMeta: Record<DeliveryChannel, { action: string; title: string }> =
  {
    desktop: { action: "下载已签名安装包", title: "桌面端" },
    mini_program: { action: "展示可解析二维码", title: "小程序" },
    mobile: { action: "查看移动端交付", title: "移动端" },
    web: { action: "打开内网应用", title: "Web 应用" },
  };

export default function MarketplaceDetailPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } = useCatalogEntry(applicationId);
  const toggleLike = useToggleLike(applicationId);
  const rateApplication = useRateApplication(applicationId);

  useEffect(() => {
    if (applicationId) {
      rememberLastViewedApplicationId(applicationId);
    }
  }, [applicationId]);

  if (isPending) {
    return <SkeletonDetail />;
  }

  if (isError || !data) {
    if (error?.message.includes("403")) {
      return <NotFoundBlock description="您没有访问此应用的权限" />;
    }
    return (
      <ErrorBlock
        description={error?.message ?? "应用不存在或当前员工无权访问。"}
        title="应用详情加载失败"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button disabled title="交付动作接口待接入" type="primary">
            开始使用
          </Button>
        }
        description={data.summary}
        title={data.name}
      />
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
