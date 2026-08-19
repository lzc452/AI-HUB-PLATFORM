import { useMemo, useState } from "react";
import { Avatar, Button, Pagination, Spin, Tabs, Typography } from "antd";

import { EmptyBlock } from "../../components/common/EmptyBlock";
import { MessageError } from "../../shared/ui/message";
import {
  useMarkAllNotificationsRead,
  useNotifications,
} from "../../modules/notification/useNotification";
import type { NotificationRecord } from "../../modules/notification/notification.client";
import { NotificationDetailModal } from "../../components/common/NotificationDetailModal";
import {
  formatRelativeTime,
  resolveNotificationMeta,
} from "../../modules/notification/notificationMeta";

const { Text } = Typography;

type TabKey = "all" | "unread";

const TAB_ITEMS = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未读" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function NotificationsPage() {
  const { data, error, isError, isPending } = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<NotificationRecord | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (activeTab === "unread") {
      return data.filter((n) => n.readAt === null);
    }
    return data;
  }, [data, activeTab]);

  const total = filtered.length;
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const unreadIds = useMemo(
    () =>
      data?.filter((n) => n.readAt === null).map((n) => n.notificationId) ?? [],
    [data],
  );

  const handleTabChange = (key: string) => {
    setActiveTab(key as TabKey);
    setPage(1);
  };

  const handleMarkAllRead = () => {
    if (unreadIds.length === 0) return;
    markAllRead.mutate(unreadIds);
  };

  return (
    <div className="space-y-4 bg-white p-2 rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          activeKey={activeTab}
          className="!mb-0 min-w-[140px]"
          items={TAB_ITEMS}
          onChange={handleTabChange}
          size="small"
        />
        <Button
          disabled={unreadIds.length === 0 || markAllRead.isPending}
          loading={markAllRead.isPending}
          onClick={handleMarkAllRead}
          type="link"
        >
          全部标记已读
        </Button>
      </div>

      {isPending ? (
        <div className="py-12 text-center">
          <Spin aria-label="通知加载中" />
        </div>
      ) : null}

      <MessageError active={isError} cause={error} title="通知加载失败" />

      {!isPending && data && data.length === 0 ? (
        <EmptyBlock description="暂无通知" />
      ) : null}

      {!isPending && data && data.length > 0 && filtered.length === 0 ? (
        <EmptyBlock description="没有符合条件的通知" />
      ) : null}

      {!isPending && filtered.length > 0 ? (
        <ul aria-label="通知列表" className="m-0 list-none p-0" role="list">
          {paged.map((notification) => {
            const meta = resolveNotificationMeta(notification);
            const Icon = meta.icon;
            const isUnread = notification.readAt === null;

            return (
              <li
                className={`group cursor-pointer border-b border-[#f0f0f0] p-4 transition-colors last:border-b-0 hover:bg-[#f5f5f5] ${
                  isUnread ? "bg-white" : "bg-white"
                }`}
                key={notification.notificationId}
                onClick={() => setSelected(notification)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelected(notification);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start gap-4">
                  <div className="flex shrink-0 flex-col items-center pt-1">
                    <span
                      aria-hidden="true"
                      className={`mb-2 block h-2 w-2 rounded-full ${
                        isUnread ? "bg-[#1677ff]" : "bg-transparent"
                      }`}
                    />
                    <Avatar
                      className="flex items-center justify-center rounded-xl text-lg"
                      icon={<Icon />}
                      shape="square"
                      size={40}
                      style={{
                        backgroundColor: meta.iconBg,
                        color: meta.iconColor,
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text
                      className={`block truncate text-sm ${
                        isUnread
                          ? "font-semibold text-[#1f1f1f]"
                          : "text-[#1f1f1f]"
                      }`}
                    >
                      {meta.title}
                    </Text>
                    <Text className="block truncate text-sm" type="secondary">
                      {meta.subtitle}
                    </Text>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <Text className="text-sm" type="secondary">
                      {formatRelativeTime(notification.createdAt)}
                    </Text>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!isPending && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Text className="text-sm text-[#595959]">共 {total} 条</Text>
          <Pagination
            current={page}
            onChange={setPage}
            onShowSizeChange={(_, size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            showSizeChanger
            total={total}
          />
        </div>
      ) : null}

      <NotificationDetailModal
        notification={selected}
        onClose={() => setSelected(null)}
        open={selected !== null}
      />
    </div>
  );
}
