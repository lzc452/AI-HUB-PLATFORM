import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";

import {
  DEPARTMENT_SOURCE_META,
  DEPARTMENT_STATUS_META,
  type DepartmentFilterValue,
  type DepartmentSource,
  type DepartmentStatus,
} from "./constants";

interface DepartmentFilterBarProps {
  /** 当前筛选值（受控，由父组件持有）。 */
  value: DepartmentFilterValue;
  onBatchImport: () => void;
  onCreate: () => void;
  onSync: () => void;
  /** 增量更新回调，父组件负责合并状态。 */
  onChange: (patch: Partial<DepartmentFilterValue>) => void;
}

/** 部门筛选栏：纯受控展示组件，状态完全由 DepartmentManagementTab 持有。 */
export function DepartmentFilterBar({
  value,
  onBatchImport,
  onCreate,
  onSync,
  onChange,
}: DepartmentFilterBarProps) {
  const statusOptions = Object.entries(DEPARTMENT_STATUS_META).map(
    ([key, { text }]) => ({
      label: text,
      value: key as DepartmentStatus,
    }),
  );

  const sourceOptions = Object.entries(DEPARTMENT_SOURCE_META).map(
    ([key, { text }]) => ({
      label: text,
      value: key as DepartmentSource,
    }),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        allowClear
        className="!w-[180px]"
        onChange={(e) => onChange({ searchText: e.target.value })}
        placeholder="搜索部门名称"
        prefix={<SearchOutlined className="text-[#bfbfbf]" />}
        value={value.searchText}
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
        options={sourceOptions}
        placeholder="全部来源"
        style={{ width: 152 }}
        value={value.source}
      />
      <div className="ml-auto flex flex-wrap gap-2">
        <Button onClick={onCreate} type="primary">新建部门</Button>
        <Button onClick={onBatchImport}>批量导入</Button>
        <Button onClick={onSync}>发起同步</Button>
      </div>
    </div>
  );
}
