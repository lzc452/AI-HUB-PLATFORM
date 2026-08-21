import {
  AndroidOutlined,
  AppstoreOutlined,
  DesktopOutlined,
  GlobalOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Skeleton, Table, Tag, Tooltip } from "antd";
import type { TableProps } from "antd";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { DeliveryChannel } from "@ai-hub/contracts";

import type {
  AdminApplicationRow,
  AdminApplicationStatus,
} from "../../modules/application/adminListMeta";
import { iconGradient } from "../../modules/marketplace/catalogMeta";

export type ApplicationRowAction =
  | "delete"
  | "edit"
  | "publish"
  | "republish"
  | "review"
  | "view"
  | "version";

export interface ApplicationAdminTableProps {
  isLoading?: boolean;
  isError?: boolean;
  onAction?: (action: ApplicationRowAction, row: AdminApplicationRow) => void;
  rows: readonly AdminApplicationRow[];
  /** 无审核权限时不展示"审核"行操作。 */
  canReview?: boolean;
}

const channelMeta: Record<
  DeliveryChannel,
  { icon: ReactNode; label: string; color: string }
> = {
  web: {
    color: "#2f6bff",
    icon: <GlobalOutlined aria-hidden="true" />,
    label: "Web",
  },
  desktop: {
    color: "#7a5af8",
    icon: <DesktopOutlined aria-hidden="true" />,
    label: "桌面端",
  },
  mobile: {
    color: "#12b76a",
    icon: <AndroidOutlined aria-hidden="true" />,
    label: "移动端",
  },
  mini_program: {
    color: "#f79009",
    icon: <AppstoreOutlined aria-hidden="true" />,
    label: "小程序",
  },
};

const statusMeta: Record<
  AdminApplicationStatus,
  { label: string; color: string; background: string }
> = {
  published: {
    background: "#e6f4ff",
    color: "#0958d9",
    label: "已上架",
  },
  in_review: {
    background: "#fff7e6",
    color: "#ad6800",
    label: "审核中",
  },
  approved: {
    background: "#f6ffed",
    color: "#237804",
    label: "已通过",
  },
  draft: {
    background: "#f5f5f5",
    color: "#595959",
    label: "草稿",
  },
  withdrawn: {
    background: "#fff1f0",
    color: "#cf1322",
    label: "已下架",
  },
  archived: {
    background: "#f5f5f5",
    color: "#8c8c8c",
    label: "已归档",
  },
};

/**
 * 应用管理数据表：
 * - 应用名称 + 渐变图标 + 简介
 * - 状态徽标（已上架 / 审核中 / 草稿 / 已下架），配色与设计稿 1:1
 * - 当前版本号、负责人 / 部门、交付渠道（图标 chip 组）、最近更新（相对时间）
 * - 操作列：根据状态动态展示查看 / 版本 / 继续编辑 / 重新发布 / 审核 / 删除
 * - 加载/错误/空态：内嵌 Skeleton、空提示与失败提示
 */
export function ApplicationAdminTable({
  canReview = true,
  isError = false,
  isLoading = false,
  onAction,
  rows,
}: ApplicationAdminTableProps) {
  if (isLoading) {
    return <TableSkeleton />;
  }
  if (isError) {
    return (
      <div
        className="rounded-md border border-[#ffccc7] bg-[#fff1f0] px-4 py-6 text-center text-sm text-[#cf1322]"
        role="alert"
      >
        应用列表加载失败，请稍后重试。
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[#d9d9d9] bg-white px-4 py-10 text-center text-sm text-[#8c8c8c]">
        没有符合条件的应用，请调整筛选条件。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#f0f0f0] bg-white">
      <Table<AdminApplicationRow>
        aria-label="应用管理列表"
        columns={buildColumns(onAction, canReview)}
        dataSource={[...rows]}
        pagination={false}
        rowKey="applicationId"
        scroll={{ x: 960 }}
        size="middle"
      />
    </div>
  );
}

function buildColumns(
  onAction?: (action: ApplicationRowAction, row: AdminApplicationRow) => void,
  canReview = true,
): NonNullable<TableProps<AdminApplicationRow>["columns"]> {
  return [
    {
      title: "应用名称",
      key: "name",
      width: "24%",
      render: (_, row) => {
        // 惰性创建的草稿可能尚未填写名称：空名称显示「未命名草稿」。
        const displayName = row.name.trim() || "未命名草稿";
        return (
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
              style={{ background: iconGradient(row.applicationId) }}
            >
              {displayName.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <Link
                aria-label={`查看应用 ${displayName}`}
                className="block truncate text-sm font-medium !text-[#1f1f1f] transition-colors hover:!text-[#1677ff]"
                to={`/applications/${row.applicationId}`}
              >
                {displayName}
              </Link>
              <p className="m-0 line-clamp-2 text-xs !text-[#8c8c8c]">
                {row.summary}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      title: "状态",
      key: "status",
      width: "10%",
      render: (_, row) => <StatusTag status={row.status} />,
    },
    {
      title: "当前版本",
      dataIndex: "currentVersion",
      key: "currentVersion",
      width: "10%",
      render: (value: string) => (
        <span className="font-mono text-xs !text-[#1f1f1f]">{value}</span>
      ),
    },
    {
      title: "负责人 / 所属部门",
      key: "owner",
      width: "14%",
      render: (_, row) => (
        <div className="flex flex-col text-xs">
          <span className="!text-[#1f1f1f]">{row.ownerName}</span>
          <span className="!text-[#8c8c8c]">/ {row.departmentName}</span>
        </div>
      ),
    },
    {
      title: "交付渠道",
      key: "channels",
      width: "14%",
      render: (_, row) => <ChannelTags channels={row.deliveryChannels} />,
    },
    {
      title: "最近更新",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: "12%",
      render: (value: string) => (
        <span className="text-xs !text-[#595959]">
          {formatRelativeTime(value)}
        </span>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: "16%",
      render: (_, row) => (
        <RowActions canReview={canReview} onAction={onAction} row={row} />
      ),
    },
  ];
}

function StatusTag({ status }: { status: AdminApplicationStatus }) {
  const meta = statusMeta[status];
  return (
    <Tag
      bordered={false}
      className="!m-0"
      style={{ background: meta.background, color: meta.color }}
    >
      <span
        aria-hidden="true"
        className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
        style={{ background: meta.color }}
      />
      {meta.label}
    </Tag>
  );
}

function ChannelTags({ channels }: { channels: readonly DeliveryChannel[] }) {
  if (channels.length === 0) {
    return <span className="text-xs !text-[#bfbfbf]">未配置</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {channels.map((channel) => {
        const meta = channelMeta[channel];
        return (
          <Tooltip key={channel} title={meta.label}>
            <Tag
              aria-label={meta.label}
              bordered
              className="!m-0 inline-flex items-center gap-1"
              style={{ color: meta.color }}
            >
              <span aria-hidden="true" className="text-xs">
                {meta.icon}
              </span>
              {meta.label}
            </Tag>
          </Tooltip>
        );
      })}
    </div>
  );
}

function RowActions({
  canReview = true,
  onAction,
  row,
}: {
  canReview?: boolean;
  onAction?:
    | ((action: ApplicationRowAction, row: AdminApplicationRow) => void)
    | undefined;
  row: AdminApplicationRow;
}) {
  const handle = (action: ApplicationRowAction) => () =>
    onAction?.(action, row);

  if (row.status === "in_review") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {canReview && (
          <ActionLink
            ariaLabel={`审核 ${row.name}`}
            label="审核"
            onClick={handle("review")}
          />
        )}
        <ActionLink
          ariaLabel={`查看 ${row.name}`}
          label="查看"
          onClick={handle("view")}
        />
      </div>
    );
  }

  if (row.status === "draft") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionLink
          ariaLabel={`继续编辑 ${row.name}`}
          label="继续编辑"
          onClick={handle("edit")}
        />
        <ActionLink
          ariaLabel={`删除 ${row.name}`}
          danger
          label="删除"
          onClick={handle("delete")}
        />
      </div>
    );
  }

  if (row.status === "withdrawn") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionLink
          ariaLabel={`查看 ${row.name}`}
          label="查看"
          onClick={handle("view")}
        />
        <ActionLink
          ariaLabel={`重新发布 ${row.name}`}
          label="重新发布"
          onClick={handle("republish")}
        />
      </div>
    );
  }

  if (row.status === "approved") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionLink
          ariaLabel={`发布 ${row.name}`}
          label="发布"
          onClick={handle("publish")}
        />
        <ActionLink
          ariaLabel={`查看 ${row.name}`}
          label="查看"
          onClick={handle("view")}
        />
        <ActionLink
          ariaLabel={`查看 ${row.name} 版本`}
          label="版本"
          onClick={handle("version")}
        />
      </div>
    );
  }

  if (row.status === "archived") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionLink
          ariaLabel={`查看 ${row.name}`}
          label="查看"
          onClick={handle("view")}
        />
        <ActionLink
          ariaLabel={`查看 ${row.name} 版本`}
          label="版本"
          onClick={handle("version")}
        />
      </div>
    );
  }

  // 默认：已上架
  const moreItems = [
    {
      key: "version",
      label: (
        <span aria-label={`查看 ${row.name} 版本`} onClick={handle("version")}>
          版本
        </span>
      ),
    },
    {
      key: "view",
      label: (
        <span aria-label={`查看 ${row.name}`} onClick={handle("view")}>
          查看
        </span>
      ),
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActionLink
        ariaLabel={`查看 ${row.name}`}
        label="查看"
        onClick={handle("view")}
      />
      <ActionLink
        ariaLabel={`查看 ${row.name} 版本`}
        label="版本"
        onClick={handle("version")}
      />
      <Dropdown menu={{ items: moreItems }} trigger={["click"]}>
        <Button
          aria-label={`更多操作 ${row.name}`}
          icon={<MoreOutlined aria-hidden="true" />}
          size="small"
          type="text"
        />
      </Dropdown>
    </div>
  );
}

function ActionLink({
  ariaLabel,
  danger = false,
  label,
  onClick,
}: {
  ariaLabel: string;
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={ariaLabel}
      danger={danger}
      onClick={onClick}
      size="small"
      type="link"
    >
      {label}
    </Button>
  );
}

function TableSkeleton() {
  return (
    <div
      aria-busy="true"
      className="space-y-3 rounded-2xl border border-[#f0f0f0] bg-white p-4"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div className="flex items-center gap-4" key={index}>
          <Skeleton.Avatar active shape="square" size={40} />
          <div className="flex-1">
            <Skeleton.Input active size="small" style={{ width: 180 }} />
            <Skeleton.Input
              active
              className="!mt-2"
              size="small"
              style={{ width: 320 }}
            />
          </div>
          <Skeleton.Button active size="small" style={{ width: 96 }} />
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const updated = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - updated;
  if (Number.isNaN(updated)) {
    return "—";
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "昨天";
  }
  if (days < 7) {
    return `${days} 天前`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)} 周前`;
  }
  return new Date(iso).toLocaleDateString("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
