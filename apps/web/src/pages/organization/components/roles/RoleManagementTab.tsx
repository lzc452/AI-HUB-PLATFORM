import { useMemo, useState } from "react";
import type { Key } from "react";

import { createDefaultRoleFilters, type RoleFilterValue } from "./constants";
import { RoleFilterBar } from "./RoleFilterBar";
import { RoleTable } from "./RoleTable";
import { useRoleRows } from "./hooks/useRoleRows";

/**
 * 角色管理页签容器：唯一持有筛选状态与过滤派生逻辑。
 * 数据通过 useRoleRows 获取后传入子组件；筛选状态收敛为单一对象，
 * 通过 onChange 把增量补丁回传给自身 state（props 向下、回调向上）。
 */
export function RoleManagementTab() {
  const { data: roles, error, isPending } = useRoleRows();
  const [filters, setFilters] = useState<RoleFilterValue>(
    createDefaultRoleFilters(),
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  const filteredRows = useMemo(() => {
    if (!roles) return [];
    return roles.filter((row) => {
      const matchesSearch =
        !filters.searchText ||
        row.roleName.toLowerCase().includes(filters.searchText.toLowerCase());
      const matchesType = !filters.type || row.roleType === filters.type;
      const matchesStatus = !filters.status || row.status === filters.status;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [roles, filters]);

  // 按设计图，当前角色接口未就绪；保留 pending/error 占位，方便后续替换为真实查询。
  if (isPending) {
    return (
      <section className="space-y-2 rounded-xl border border-solid border-[#d9d9d9] bg-white p-2 text-[13px] text-[#595959]">
        角色数据加载中…
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-2 rounded-xl bg-white p-2 text-[13px] text-[#ff4d4f]">
        角色数据加载失败：{error.message}
      </section>
    );
  }

  const rowSelection = {
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
    selectedRowKeys,
    type: "checkbox" as const,
  };

  return (
    <section className="space-y-2 rounded-xl bg-white p-2">
      <RoleFilterBar
        selectedCount={selectedRowKeys.length}
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />
      <RoleTable rows={filteredRows} rowSelection={rowSelection} />
    </section>
  );
}
