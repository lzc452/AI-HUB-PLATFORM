import {
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { Button, Input, Select } from "antd";

import {
  ROLE_STATUS_META,
  ROLE_TYPE_META,
  type RoleFilterValue,
  type RoleStatus,
  type RoleType,
} from "./constants";

interface RoleFilterBarProps {
  /** 当前已选中的行数，用于控制批量操作可用性。 */
  selectedCount: number;
  /** 当前筛选值（受控，由父组件持有）。 */
  value: RoleFilterValue;
  /** 增量更新回调，父组件负责合并状态。 */
  onChange: (patch: Partial<RoleFilterValue>) => void;
}

/** 角色筛选栏：纯受控展示组件，状态完全由 RoleManagementTab 持有。 */
export function RoleFilterBar({
  selectedCount,
  value,
  onChange,
}: RoleFilterBarProps) {
  const typeOptions = Object.entries(ROLE_TYPE_META).map(([key, { text }]) => ({
    label: text,
    value: key as RoleType,
  }));

  const statusOptions = Object.entries(ROLE_STATUS_META).map(
    ([key, { text }]) => ({
      label: text,
      value: key as RoleStatus,
    }),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        allowClear
        className="!w-[180px]"
        onChange={(e) => onChange({ searchText: e.target.value })}
        placeholder="搜索角色名称"
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
        <Button type="primary">
          新建角色
        </Button>
        <Button >权限模板</Button>
        <Button
          danger
          disabled={selectedCount === 0}
          title={selectedCount === 0 ? "请先勾选要禁用的角色" : undefined}
        >
          批量禁用 {selectedCount > 0 ? `(${selectedCount})` : ""}
        </Button>
      </div>
    </div>
  );
}
