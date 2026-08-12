import { useMemo, useState } from "react";

import {
  createDefaultDepartmentFilters,
  filterDepartmentRows,
  type DepartmentFilterValue,
} from "./constants";
import { DepartmentFilterBar } from "./DepartmentFilterBar";
import { DepartmentTable } from "./DepartmentTable";
import { useDepartmentRows } from "./hooks/useDepartmentRows";

/**
 * 部门管理页签容器：唯一持有筛选状态与过滤派生逻辑。
 * 数据通过 useDepartmentRows 获取后传入子组件；筛选状态收敛为单一对象，
 * 通过 onChange 把增量补丁回传给自身 state（props 向下、回调向上）。
 */
export function DepartmentManagementTab() {
  const { data: rows, error, isPending } = useDepartmentRows();
  const [filters, setFilters] = useState<DepartmentFilterValue>(
    createDefaultDepartmentFilters(),
  );

  const parentNameMap = useMemo(
    () => new Map(rows?.map((row) => [row.departmentId, row.name]) ?? []),
    [rows],
  );

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return filterDepartmentRows(rows, filters);
  }, [rows, filters]);

  if (isPending || error) {
    return (
      <section className="space-y-2 rounded-xl bg-white p-2 text-[13px] text-[#ff4d4f]">
        {isPending && "部门数据加载中..."}
        {error && `部门数据加载失败：${error.message}`}
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-xl bg-white p-2">
      <DepartmentFilterBar
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />
      <DepartmentTable parentNameMap={parentNameMap} rows={filteredRows} />
    </section>
  );
}
