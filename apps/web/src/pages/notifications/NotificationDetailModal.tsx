import { LinkOutlined } from "@ant-design/icons";
import { Avatar, Button, Modal, Tag, Typography } from "antd";
import { Link } from "react-router-dom";

import type { NotificationRecord } from "../../modules/notification/notification.client";
import { resolveNotificationMeta } from "./notificationMeta";

const { Paragraph, Text, Title } = Typography;

interface NotificationDetailModalProps {
  notification: NotificationRecord | null;
  onClose: () => void;
  open: boolean;
}

export function NotificationDetailModal({
  notification,
  onClose,
  open,
}: NotificationDetailModalProps) {
  if (!notification) return null;

  const meta = resolveNotificationMeta(notification);
  const Icon = meta.icon;
  const createdAt = new Date(notification.createdAt).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Modal
      footer={
        <div className="flex flex-wrap gap-3">
          {meta.actions.map((action) => {
            const content = action.label === "分享应用" 
              ? (
                <span className="inline-flex items-center gap-1">
                  <LinkOutlined />
                  {action.label}
                </span>
              ) 
              : action.label;

            if (action.to) {
              return (
                <Link
                  key={action.label}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-4 text-sm ${
                    action.primary
                      ? "border-0 bg-[#1677ff] text-white hover:bg-[#4096ff]"
                      : "border border-[#d9d9d9] bg-white text-[#1f1f1f] hover:border-[#1677ff] hover:text-[#1677ff]"
                  }`}
                  onClick={onClose}
                  to={action.to}
                >
                  {content}
                </Link>
              );
            }

            return (
              <Button
                key={action.label}
                onClick={action.label === "关闭" ? onClose : onClose}
                type={action.primary ? "primary" : "default"}
              >
                {content}
              </Button>
            );
          })}
        </div>
      }
      onCancel={onClose}
      open={open}
      title={null}
      width={640}
    >
      <div className="flex items-start gap-4">
        <Avatar
          className="flex shrink-0 items-center justify-center rounded-xl text-xl"
          icon={<Icon />}
          shape="square"
          size={48}
          style={{ backgroundColor: meta.iconBg, color: meta.iconColor }}
        />
        <div className="min-w-0 flex-1">
          <Title className="!mb-2 !text-lg" level={4}>
            {meta.title}
          </Title>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#595959]">
            <Tag bordered={false} color="processing">
              {meta.category}
            </Tag>
            <Text type="secondary">系统（审核中心）</Text>
            <Text type="secondary">{createdAt}</Text>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Paragraph className="!mb-0">
          <Text strong>尊敬的用户：</Text>
        </Paragraph>
        <Paragraph className="!mb-0">{meta.detailLead}</Paragraph>

        {meta.detailFields.length > 0 ? (
          <div>
            <Paragraph className="!mb-2">
              <Text strong>审核信息</Text>
            </Paragraph>
            <ul className="m-0 list-none space-y-1 p-0 text-[#595959]">
              {meta.detailFields.map((field) => (
                <li key={field.label}>
                  <Text type="secondary">• {field.label}：{field.value}</Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Paragraph className="!mb-0 text-[#595959]">
          您的应用可被平台内所有成员搜索、查看并申请使用。感谢您为平台生态做出的贡献！
        </Paragraph>
      </div>
    </Modal>
  );
}
