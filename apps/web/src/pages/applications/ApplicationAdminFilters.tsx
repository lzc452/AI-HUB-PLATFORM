import {
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { Button, Input, Segmented, Select } from "antd";
import type { DeliveryChannel } from "@ai-hub/contracts";

import type {
  AdminApplicationFilterMode,
  AdminApplicationStatus,
} from "../../modules/application/adminListMeta";

export interface FilterOption {
  label: string;
  value: string;
}

export interface ApplicationAdminFiltersProps {
  applicationType: string;
  applicationTypeOptions: readonly FilterOption[];
  channel: DeliveryChannel | undefined;
  channelOptions: readonly FilterOption[];
  countByMode: Record<AdminApplicationFilterMode, number>;
  departmentId: string;
  departmentOptions: readonly FilterOption[];
  isLoading?: boolean;
  keyword: string;
  mode: AdminApplicationFilterMode;
  onApplicationTypeChange: (value: string) => void;
  onChannelChange: (value: DeliveryChannel | undefined) => void;
  onDepartmentChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onModeChange: (value: AdminApplicationFilterMode) => void;
  onReset: () => void;
  onSortChange: (value: SortOption) => void;
  onStatusChange: (value: string) => void;
  sort: SortOption;
  status: string;
  statusOptions: readonly FilterOption[];
}

export type SortOption = "recent" | "name" | "status";

const sortOptions: ReadonlyArray<{ label: string; value: SortOption }> = [
  { label: "最近更新", value: "recent" },
  { label: "名称 A → Z", value: "name" },
  { label: "状态", value: "status" },
];

const modeLabel: Record<AdminApplicationFilterMode, string> = {
  all: "全部应用",
  owned: "我负责的",
  review: "待我审核",
};

const PLACEHOLDER_ALL = "all";

/**
 * 应用管理筛选条：3 段式 Tab（全部 / 待我审核 / 我负责的） + 4 个下拉 + 搜索 + 排序 + 重置。
 * - 视觉与设计稿一致：白底圆角、浅色边框、统一的间距；与 marketplace 筛选条保持节奏一致。
 * - 状态/部门/类型/渠道均使用 placeholder 表示未筛选，与设计稿"全部状态/所属部门/应用类型/交付渠道"完全对齐。
 * - 排序为受控选择，默认 "最近更新"，与设计稿右上角下拉默认态一致。
 */
export function ApplicationAdminFilters({
  applicationType,
  applicationTypeOptions,
  channel,
  channelOptions,
  countByMode,
  departmentId,
  departmentOptions,
  isLoading = false,
  keyword,
  mode,
  onApplicationTypeChange,
  onChannelChange,
  onDepartmentChange,
  onKeywordChange,
  onModeChange,
  onReset,
  onSortChange,
  onStatusChange,
  sort,
  status,
  statusOptions,
}: ApplicationAdminFiltersProps) {
  const modeItems: ReadonlyArray<{ label: React.ReactNode; value: AdminApplicationFilterMode }> = [
    {
      label: <ModeLabel count={countByMode.all} mode="all" />,
      value: "all",
    },
    {
      label: <ModeLabel count={countByMode.review} mode="review" />,
      value: "review",
    },
    {
      label: <ModeLabel count={countByMode.owned} mode="owned" />,
      value: "owned",
    },
  ];

  return (
    <section
      aria-label="应用筛选"
      className="space-y-3 rounded-2xl border border-[#f0f0f0] bg-white p-3 sm:p-4"
    >
      <div className="overflow-x-auto">
        <Segmented<AdminApplicationFilterMode>
          aria-label="应用视图"
          onChange={(value) => onModeChange(value)}
          options={modeItems as { label: React.ReactNode; value: AdminApplicationFilterMode }[]}
          size="middle"
          value={mode}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Input
          allowClear
          aria-label="搜索应用"
          className="!w-full sm:!w-64"
          disabled={isLoading}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索应用名称或应用 ID"
          prefix={<SearchOutlined aria-hidden="true" className="text-[#bfbfbf]" />}
          value={keyword}
        />

        <Select
          allowClear
          aria-label="全部状态"
          className="!min-w-28"
          disabled={isLoading}
          onChange={(value?: string) => onStatusChange(value ?? PLACEHOLDER_ALL)}
          options={statusOptions as FilterOption[]}
          placeholder="全部状态"
          value={status === PLACEHOLDER_ALL ? undefined : status}
        />

        <Select
          allowClear
          aria-label="所属部门"
          className="!min-w-32"
          disabled={isLoading}
          onChange={(value?: string) => onDepartmentChange(value ?? PLACEHOLDER_ALL)}
          options={departmentOptions as FilterOption[]}
          placeholder="所属部门"
          showSearch
          value={departmentId === PLACEHOLDER_ALL ? undefined : departmentId}
        />

        <Select
          allowClear
          aria-label="应用类型"
          className="!min-w-28"
          disabled={isLoading}
          onChange={(value?: string) => onApplicationTypeChange(value ?? PLACEHOLDER_ALL)}
          options={applicationTypeOptions as FilterOption[]}
          placeholder="应用类型"
          value={applicationType === PLACEHOLDER_ALL ? undefined : applicationType}
        />

        <Select
          allowClear
          aria-label="交付渠道"
          className="!min-w-28"
          disabled={isLoading}
          onChange={(value?: DeliveryChannel) => onChannelChange(value)}
          options={channelOptions as FilterOption[]}
          placeholder="交付渠道"
          value={channel}
        />

        <Select
          aria-label="排序方式"
          className="!min-w-28"
          disabled={isLoading}
          onChange={(value: SortOption) => onSortChange(value)}
          options={sortOptions as { label: string; value: SortOption }[]}
          suffixIcon={<SwapOutlined aria-hidden="true" />}
          value={sort}
        />

        <Button
          aria-label="重置筛选"
          disabled={isLoading}
          icon={<ReloadOutlined aria-hidden="true" />}
          onClick={onReset}
        >
          重置
        </Button>
      </div>
    </section>
  );
}

function ModeLabel({
  count,
  mode,
}: {
  count: number;
  mode: AdminApplicationFilterMode;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{modeLabel[mode]}</span>
      <span className="text-xs text-[#8c8c8c]">{count}</span>
    </span>
  );
}

export const defaultStatusFilterOptions: ReadonlyArray<FilterOption> = [
  { label: "已上架", value: "published" satisfies AdminApplicationStatus },
  { label: "审核中", value: "in_review" satisfies AdminApplicationStatus },
  { label: "草稿", value: "draft" satisfies AdminApplicationStatus },
  { label: "已下架", value: "withdrawn" satisfies AdminApplicationStatus },
];
