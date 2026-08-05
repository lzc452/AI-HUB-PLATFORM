import { Alert, Button, Spin, Tag, Typography } from "antd";

import {
  useMarkNotificationRead,
  useNotifications,
} from "../../modules/notification/useNotification";

const { Paragraph, Text, Title } = Typography;

function formatCreatedAt(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(timestamp));
}

export default function NotificationsPage() {
  const { data, error, isError, isPending } = useNotifications();
  const markRead = useMarkNotificationRead();

  return (
    <div className="space-y-6">
      <section aria-labelledby="notifications-heading" className="space-y-3">
        <Text type="secondary">Phase 4 / In-app notification center</Text>
        <Title id="notifications-heading" level={1} className="!mb-0">
          站内通知
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          业务通知保留在站内；钉钉投递失败会进入可重试状态。
        </Paragraph>
      </section>
      {isPending ? <Spin aria-label="通知加载中" /> : null}
      {isError ? (
        <Alert
          description={error.message}
          showIcon
          title="通知加载失败"
          type="error"
        />
      ) : null}
      {data && data.length === 0 ? (
        <Alert
          showIcon
          type="info"
          title="暂无未读通知"
          description="通知中心会显示审核、下架、举报处理和安全告警等事件。"
        />
      ) : null}
      {data && data.length > 0 ? (
        <ul className="m-0 list-none space-y-3 p-0" aria-label="通知列表">
          {data.map((notification) => (
            <li
              className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
              key={notification.notificationId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Tag color={notification.readAt ? "default" : "blue"}>
                      {notification.readAt ? "已读" : "未读"}
                    </Tag>
                    <Text type="secondary">{notification.eventType}</Text>
                  </div>
                  <Paragraph className="!mb-0">{notification.message}</Paragraph>
                  <Text type="secondary" className="text-xs">
                    {formatCreatedAt(notification.createdAt)}
                  </Text>
                </div>
                {notification.readAt ? null : (
                  <Button
                    loading={markRead.isPending}
                    onClick={() =>
                      markRead.mutate(notification.notificationId)
                    }
                    size="small"
                  >
                    标记已读
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
