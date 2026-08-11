import {
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Button, Input, Select } from "antd";
import type { ReactNode } from "react";

import { ROLE_OPTIONS, SOURCE_OPTIONS, type UserFilterValue } from "../constants";

interface UserFilterBarProps {
  departmentOptions: { label: string; value: string }[];
  statusOptions: { label: ReactNode; value: string }[];
  /** 当前筛选值（受控，由父组件持有）。 */
  value: UserFilterValue;
  /** 增量更新回调，父组件负责合并状态。 */
  onChange: (patch: Partial<UserFilterValue>) => void;
}

/** 筛选栏：纯受控展示组件，状态完全由 UserManagementTab 持有。 */
export function UserFilterBar({
  departmentOptions,
  statusOptions,
  value,
  onChange,
}: UserFilterBarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        allowClear
        className="w-[200px]"
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
        style={{ width: 160 }}
        value={value.department}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ role: next })}
        options={ROLE_OPTIONS.map((role) => ({ label: role, value: role }))}
        placeholder="全部角色"
        style={{ width: 160 }}
        value={value.role}
      />
      <Select
        allowClear
        onChange={(next) => onChange({ status: next })}
        options={statusOptions}
        placeholder="全部状态"
        style={{ width: 160 }}
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
        style={{ width: 160 }}
        value={value.source}
      />
      <div className="ml-auto flex flex-wrap gap-2">
        <Button icon={<PlusOutlined />} type="primary">
          新建用户
        </Button>
        <Button icon={<UploadOutlined />}>批量导入</Button>
        <Button danger icon={<StopOutlined />}>
          批量停用
        </Button>
      </div>
    </div>
  );
}
