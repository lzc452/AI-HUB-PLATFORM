import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";
import type { ReactNode } from "react";

import { SOURCE_OPTIONS, type UserFilterValue } from "../constants";

interface UserFilterBarProps {
  departmentOptions: { label: string; value: string }[];
  disabledCount: number;
  onBatchDisable: () => void;
  onBatchImport: () => void;
  onCreate: () => void;
  roleOptions: string[];
  statusOptions: { label: ReactNode; value: string }[];
  /** 当前筛选值（受控，由父组件持有）。 */
  value: UserFilterValue;
  /** 增量更新回调，父组件负责合并状态。 */
  onChange: (patch: Partial<UserFilterValue>) => void;
}

/** 筛选栏：纯受控展示组件，状态完全由 UserManagementTab 持有。 */
export function UserFilterBar({
  departmentOptions,
  disabledCount,
  onBatchDisable,
  onBatchImport,
  onCreate,
  roleOptions,
  statusOptions,
  value,
  onChange,
}: UserFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        allowClear
        className="!w-[180px]"
        onChange={(e) => onChange({ searchText: e.target.value })}
        placeholder="搜索工号 / 姓名"
        prefix={<SearchOutlined className="text-[#bfbfbf]" />}
        value={value.searchText}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ department: next })}
        options={departmentOptions}
        placeholder="全部部门"
        style={{ width: 152 }}
        value={value.department}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ role: next })}
        options={roleOptions.map((role) => ({ label: role, value: role }))}
        placeholder="全部角色"
        style={{ width: 152 }}
        value={value.role}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ status: next })}
        options={statusOptions}
        placeholder="全部状态"
        style={{ width: 152 }}
        value={value.status}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ source: next })}
        options={SOURCE_OPTIONS.map((source) => ({
          label: source,
          value: source,
        }))}
        placeholder="全部来源"
        style={{ width: 152 }}
        value={value.source}
      />
      <div className="ml-auto flex flex-wrap gap-2">
        <Button onClick={onCreate} type="primary">新建用户</Button>
        <Button onClick={onBatchImport}>批量导入</Button>
        <Button
          danger
          disabled={disabledCount === 0}
          onClick={onBatchDisable}
          title={disabledCount === 0 ? "请先勾选要停用的用户" : undefined}
        >
          批量停用 {disabledCount > 0 ? `(${disabledCount})` : ""}
        </Button>
      </div>
    </div>
  );
}
