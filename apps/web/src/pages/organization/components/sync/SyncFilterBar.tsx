import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";

import {
  SYNC_STATUS_META,
  SYNC_TYPE_META,
  type SyncFilterValue,
  type SyncTaskStatus,
  type SyncTaskType,
} from "./constants";

interface SyncFilterBarProps {
  /** 当前筛选值（受控，由父组件持有）。 */
  value: SyncFilterValue;
  /** 增量更新回调，父组件负责合并状态。 */
  onChange: (patch: Partial<SyncFilterValue>) => void;
}

/** 同步状态筛选栏：纯受控展示组件，状态完全由 SyncManagementTab 持有。 */
export function SyncFilterBar({ value, onChange }: SyncFilterBarProps) {
  const typeOptions = Object.entries(SYNC_TYPE_META).map(([key, { text }]) => ({
    label: text,
    value: key as SyncTaskType,
  }));

  const statusOptions = Object.entries(SYNC_STATUS_META).map(
    ([key, { text }]) => ({
      label: text,
      value: key as SyncTaskStatus,
    }),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        allowClear
        className="!w-[180px]"
        onChange={(e) => onChange({ searchText: e.target.value })}
        placeholder="搜索任务名称/同步对象"
        prefix={<SearchOutlined className="text-[#bfbfbf]" />}
        value={value.searchText}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ type: next })}
        options={typeOptions}
        placeholder="全部类型"
        style={{ width: 152 }}
        value={value.type}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ status: next })}
        options={statusOptions}
        placeholder="全部状态"
        style={{ width: 152 }}
        value={value.status}
      />
      <div className="ml-auto flex flex-wrap gap-2">
        <Button type="primary">发起全量同步</Button>
        <Button>重新执行失败任务</Button>
        <Button>导出日志</Button>
      </div>
    </div>
  );
}
