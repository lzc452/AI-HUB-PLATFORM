import {
  AndroidOutlined,
  AppstoreOutlined,
  DesktopOutlined,
  GlobalOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Skeleton, Tooltip } from "antd";
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
  | "republish"
  | "review"
  | "view"
  | "version";

export interface ApplicationAdminTableProps {
  isLoading?: boolean;
  isError?: boolean;
  onAction?: (
    action: ApplicationRowAction,
    row: AdminApplicationRow,
  ) => void;
  rows: readonly AdminApplicationRow[];
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
  { label: string; color: string; background: string; border: string }
> = {
  published: {
    background: "#e6f4ff",
    border: "#91caff",
    color: "#0958d9",
    label: "已上架",
  },
  in_review: {
    background: "#fff7e6",
    border: "#ffd591",
    color: "#ad6800",
    label: "审核中",
  },
  draft: {
    background: "#f5f5f5",
    border: "#d9d9d9",
    color: "#595959",
    label: "草稿",
  },
  withdrawn: {
    background: "#fff1f0",
    border: "#ffa39e",
    color: "#cf1322",
    label: "已下架",
  },
};

const columnHeaderClass =
  "!px-3 !py-2 !text-xs !font-medium !text-[#595959] !bg-[#fafafa]";

const cellClass = "!px-3 !py-3 !align-middle";

/**
 * 应用管理数据表：
 * - 应用名称 + 渐变图标 + 简介
 * - 状态徽标（已上架 / 审核中 / 草稿 / 已下架），配色与设计稿 1:1
 * - 当前版本号、负责人 / 部门、交付渠道（图标 chip 组）、最近更新（相对时间）
 * - 操作列：根据状态动态展示查看 / 版本 / 继续编辑 / 重新发布 / 审核 / 删除
 * - 加载/错误/空态：内嵌 Skeleton、空提示与失败提示
 */
export function ApplicationAdminTable({
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
        没有符合条件的应用，试试调整筛选条件。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#f0f0f0] bg-white">
      <table
        aria-label="应用管理列表"
        className="min-w-full table-fixed border-separate border-spacing-0 text-sm"
      >
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr>
            <th className={`${columnHeaderClass} !text-left`}>应用名称</th>
            <th className={`${columnHeaderClass} !text-left`}>状态</th>
            <th className={`${columnHeaderClass} !text-left`}>当前版本</th>
            <th className={`${columnHeaderClass} !text-left`}>
              负责人 / 所属部门
            </th>
            <th className={`${columnHeaderClass} !text-left`}>交付渠道</th>
            <th className={`${columnHeaderClass} !text-left`}>最近更新</th>
            <th className={`${columnHeaderClass} !text-left`}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              className={`group transition-colors duration-150 hover:bg-[#f5f9ff] ${
                index % 2 === 0 ? "bg-white" : "bg-[#fcfcfd]"
              }`}
              key={row.applicationId}
            >
              <td className={`${cellClass} !text-left`}>
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
                    style={{ background: iconGradient(row.applicationId) }}
                  >
                    {row.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Link
                      aria-label={`查看应用 ${row.name}`}
                      className="block truncate text-sm font-medium !text-[#1f1f1f] transition-colors hover:!text-[#1677ff]"
                      to={`/applications/${row.applicationId}`}
                    >
                      {row.name}
                    </Link>
                    <p className="m-0 line-clamp-2 text-xs !text-[#8c8c8c]">
                      {row.summary}
                    </p>
                  </div>
                </div>
              </td>
              <td className={`${cellClass} !text-left`}>
                <StatusTag status={row.status} />
              </td>
              <td className={`${cellClass} !text-left`}>
                <span className="font-mono text-xs !text-[#1f1f1f]">
                  {row.currentVersion}
                </span>
              </td>
              <td className={`${cellClass} !text-left`}>
                <div className="flex flex-col text-xs">
                  <span className="!text-[#1f1f1f]">{row.ownerName}</span>
                  <span className="!text-[#8c8c8c]">/ {row.departmentName}</span>
                </div>
              </td>
              <td className={`${cellClass} !text-left`}>
                <ChannelChips channels={row.deliveryChannels} />
              </td>
              <td className={`${cellClass} !text-left`}>
                <span className="text-xs !text-[#595959]">
                  {formatRelativeTime(row.updatedAt)}
                </span>
              </td>
              <td className={`${cellClass} !text-left`}>
                <RowActions onAction={onAction} row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusTag({ status }: { status: AdminApplicationStatus }) {
  const meta = statusMeta[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: meta.background,
        borderColor: meta.border,
        color: meta.color,
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color }}
      />
      {meta.label}
    </span>
  );
}

function ChannelChips({ channels }: { channels: readonly DeliveryChannel[] }) {
  if (channels.length === 0) {
    return <span className="text-xs !text-[#bfbfbf]">未配置</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {channels.map((channel) => {
        const meta = channelMeta[channel];
        return (
          <Tooltip key={channel} title={meta.label}>
            <span
              aria-label={meta.label}
              className="inline-flex items-center gap-1 rounded-md border border-[#f0f0f0] bg-white px-1.5 py-0.5 text-[11px]"
              style={{ color: meta.color }}
            >
              <span aria-hidden="true" className="text-xs">
                {meta.icon}
              </span>
              <span>{meta.label}</span>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

function RowActions({
  onAction,
  row,
}: {
  onAction?:
    | ((
        action: ApplicationRowAction,
        row: AdminApplicationRow,
      ) => void)
    | undefined;
  row: AdminApplicationRow;
}) {
  const handle = (action: ApplicationRowAction) => () => onAction?.(action, row);

  if (row.status === "in_review") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionLink
          ariaLabel={`审核 ${row.name}`}
          label="审核"
          onClick={handle("review")}
        />
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
      <Dropdown
        menu={{
          items: moreItems,
        }}
        trigger={["click"]}
      >
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
    <button
      aria-label={ariaLabel}
      className={`rounded px-1.5 py-0.5 text-xs transition-colors duration-150 ${
        danger
          ? "!text-[#cf1322] hover:bg-[#fff1f0]"
          : "!text-[#1677ff] hover:bg-[#e6f4ff]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
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
