import type { DeliveryChannel } from "@ai-hub/contracts";
import { Empty, Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import { MessageError } from "../../shared/ui/message";
import { useApplicationDeliveries } from "../../modules/application/useApplication";

const { Text, Title } = Typography;

const channelTitle: Record<DeliveryChannel, string> = {
  desktop: "桌面端",
  mini_program: "小程序",
  mobile: "移动端",
  web: "Web 应用",
};

export default function ApplicationDeliveryPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } =
    useApplicationDeliveries(applicationId);

  return (
    <ApplicationAdminPage
      description="查看各交付渠道的独立配置。"
      title="交付配置"
    >
      <section aria-labelledby="delivery-heading" className="space-y-4">
        <Title id="delivery-heading" level={2} className="!mb-0">
          交付渠道
        </Title>
        {isPending ? <Spin aria-label="交付配置加载中" /> : null}
        <MessageError active={isError} cause={error} title="交付配置加载失败" />
        {data && data.length === 0 ? (
          <Empty description="暂无交付渠道配置" />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {data?.map((delivery) => (
            <div
              className="rounded-md border border-solid border-[#d9d9d9] bg-white p-4"
              key={delivery.deliveryId}
            >
              <div className="flex items-center justify-between gap-3">
                <Title level={5} className="!mb-0 !mt-0">
                  {channelTitle[delivery.channel]}
                </Title>
                <Tag color={delivery.enabled ? "success" : "default"}>
                  {delivery.enabled ? "已启用" : "未启用"}
                </Tag>
              </div>
              <Text type="secondary">
                {delivery.entryUrl} · 最低客户端版本{" "}
                {delivery.minClientVersion ?? "不限"}
              </Text>
            </div>
          ))}
        </div>
      </section>
    </ApplicationAdminPage>
  );
}
