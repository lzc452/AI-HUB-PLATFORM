import { Button, Spin, Tag, Typography } from "antd";

import { EmptyBlock } from "../../components/common/EmptyBlock";
import { ErrorBlock } from "../../components/common/ErrorBlock";
import {
  useMarkNotificationRead,
  useNotifications,
} from "../../modules/notification/useNotification";

const { Paragraph, Text } = Typography;

function formatCreatedAt(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(timestamp));
}

export default function NotificationsPage() {
  const { data, error, isError, isPending, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();

  return (
    <div className="space-y-4">
      {isPending ? <Spin aria-label="通知加载中" /> : null}
      {isError ? (
        <ErrorBlock
          description={error.message}
          onRetry={() => void refetch()}
          title="通知加载失败"
        />
      ) : null}
      {data && data.length === 0 ? <EmptyBlock description="暂无通知" /> : null}
      {data && data.length > 0 ? (
        <ul className="m-0 list-none space-y-3 p-0" aria-label="通知列表">
          {data.map((notification) => (
            <li
              className="rounded-md border border-solid border-[#d9d9d9] bg-white p-4"
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
                  <Paragraph className="!mb-0">
                    {notification.message}
                  </Paragraph>
                  <Text type="secondary" className="text-xs">
                    {formatCreatedAt(notification.createdAt)}
                  </Text>
                </div>
                {notification.readAt ? null : (
                  <Button
                    loading={markRead.isPending}
                    onClick={() => markRead.mutate(notification.notificationId)}
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
