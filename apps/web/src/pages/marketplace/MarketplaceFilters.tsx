import type { DeliveryChannel } from "@ai-hub/contracts";
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Select } from "antd";

import { channelText } from "../../modules/marketplace/catalogMeta";

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
  onTagChange: (value: string[]) => void;
  tagIds: string[];
  tagOptions: string[];
}

const channelValues = Object.keys(channelText) as DeliveryChannel[];

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
  onTagChange,
  tagIds,
  tagOptions,
}: MarketplaceFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-solid border-[#d9d9d9] bg-white p-3 shadow-sm">
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
        className="min-w-40"
        mode="multiple"
        onChange={onTagChange}
        options={tagOptions.map((value) => ({ label: value, value }))}
        placeholder="全部标签"
        value={tagIds}
      />
      <Select
        allowClear
        aria-label="所属部门"
        className="min-w-32"
        onChange={(value?: string) => onDepartmentChange(value)}
        options={departmentOptions}
        placeholder="所属部门"
        showSearch
        value={departmentId}
      />
      <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={onReset}>
        重置
      </Button>
    </div>
  );
}
