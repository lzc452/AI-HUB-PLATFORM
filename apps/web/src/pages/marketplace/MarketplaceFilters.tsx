import type { DeliveryChannel } from "@ai-hub/contracts";
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Select } from "antd";

import { channelText } from "../../modules/marketplace/catalogMeta";
import type { MarketplaceSortMode } from "./MarketplaceHero";

export interface MarketplaceFiltersProps {
  categoryId: string | undefined;
  categoryOptions: string[];
  channel: DeliveryChannel | undefined;
  departmentId: string | undefined;
  departmentOptions: { label: string; value: string }[];
  onCategoryChange: (value: string | undefined) => void;
  onChannelChange: (value: DeliveryChannel | undefined) => void;
  onDepartmentChange: (value: string | undefined) => void;
  onReset: () => void;
  onSortModeChange: (value: MarketplaceSortMode) => void;
  onTagChange: (value: string | undefined) => void;
  sortMode: MarketplaceSortMode;
  tagId: string | undefined;
  tagOptions: string[];
}

const sortPills: ReadonlyArray<{ label: string; value: MarketplaceSortMode }> =
  [
    { label: "推荐", value: "recommended" },
    { label: "高评分", value: "rating" },
    { label: "最近更新", value: "latest" },
  ];

const channelValues = Object.keys(channelText) as DeliveryChannel[];

function pillClass(active: boolean): string {
  return `inline-flex min-h-8 items-center rounded-full border px-4 text-sm transition-colors ${
    active
      ? "border-transparent bg-[#1677ff] text-white"
      : "border-[#e5e7ef] bg-white text-[#4c5580] hover:border-[#91caff] hover:text-[#0958d9]"
  }`;
}

export function MarketplaceFilters({
  categoryId,
  categoryOptions,
  channel,
  departmentId,
  departmentOptions,
  onCategoryChange,
  onChannelChange,
  onDepartmentChange,
  onReset,
  onSortModeChange,
  onTagChange,
  sortMode,
  tagId,
  tagOptions,
}: MarketplaceFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-solid border-[#eef0f4] bg-white p-3 shadow-sm">
        <Select
          allowClear
          aria-label="全部分类"
          className="min-w-32"
          onChange={(value?: string) => onCategoryChange(value)}
          options={categoryOptions.map((value) => ({ label: value, value }))}
          placeholder="全部分类"
          value={categoryId}
        />
        <Select
          allowClear
          aria-label="应用类型"
          className="min-w-32"
          onChange={(value?: DeliveryChannel) => onChannelChange(value)}
          options={channelValues.map((value) => ({
            label: channelText[value],
            value,
          }))}
          placeholder="应用类型"
          value={channel}
        />
        <Select
          allowClear
          aria-label="全部标签"
          className="min-w-32"
          onChange={(value?: string) => onTagChange(value)}
          options={tagOptions.map((value) => ({ label: value, value }))}
          placeholder="全部标签"
          value={tagId}
        />
        <Select
          allowClear
          aria-label="所属部门"
          className="min-w-32"
          onChange={(value?: string) => onDepartmentChange(value)}
          options={departmentOptions}
          placeholder="所属部门"
          value={departmentId}
        />
        <Button
          icon={<ReloadOutlined aria-hidden="true" />}
          onClick={onReset}
          type="text"
        >
          重置
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="排序与类型">
        {sortPills.map((pill) => (
          <button
            aria-pressed={sortMode === pill.value}
            className={pillClass(sortMode === pill.value)}
            key={pill.value}
            onClick={() => onSortModeChange(pill.value)}
            type="button"
          >
            {pill.label}
          </button>
        ))}
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-[#e5e7ef]" />
        {channelValues.map((value) => (
          <button
            aria-pressed={channel === value}
            className={pillClass(channel === value)}
            key={value}
            onClick={() => onChannelChange(channel === value ? undefined : value)}
            type="button"
          >
            {channelText[value]}
          </button>
        ))}
      </div>
    </div>
  );
}
