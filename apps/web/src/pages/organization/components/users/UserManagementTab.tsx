import { useMemo, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Spin, Tag } from "antd";

import type { DepartmentSummary, EmployeeSummary } from "@ai-hub/contracts";

import { MessageError } from "../../../../shared/ui/message";
import {
  STATUS_META,
  createDefaultFilters,
  type UserFilterValue,
} from "../constants";
import { useUserTableRows } from "./hooks/useUserTableRows";
import { UserFilterBar } from "./UserFilterBar";
import { UserTable } from "./UserTable";

interface UserManagementTabProps {
  departments: UseQueryResult<DepartmentSummary[], Error>;
  employees: UseQueryResult<EmployeeSummary[], Error>;
  firstError: Error | null;
  isPending: boolean;
}

/**
 * 用户管理页签容器：唯一持有筛选状态与过滤派生逻辑。
 * 数据查询在 OrganizationPage 中获取后传入，本组件只做展示态的派生与合并，
 * 通过 onChange 把筛选变更回传给自身 state（props 向下、回调向上）。
 */
export function UserManagementTab({
  departments,
  employees,
  firstError,
  isPending,
}: UserManagementTabProps) {
  const [filters, setFilters] = useState<UserFilterValue>(createDefaultFilters());

  const rows = useUserTableRows(employees, departments);

  const departmentOptions = useMemo(
    () =>
      departments.data?.map((dept) => ({ label: dept.name, value: dept.name })) ??
      [],
    [departments.data],
  );

  const statusOptions = useMemo(
    () =>
      Object.entries(STATUS_META).map(([, { color, text }]) => ({
        label: <Tag color={color}>{text}</Tag>,
        value: text,
      })),
    [],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch =
        !filters.searchText ||
        row.employeeId.includes(filters.searchText) ||
        row.displayName.includes(filters.searchText);
      const matchesDepartment =
        !filters.department || row.departmentName === filters.department;
      const matchesRole = !filters.role || row.role === filters.role;
      const matchesStatus =
        !filters.status || STATUS_META[row.status].text === filters.status;
      const matchesSource =
        !filters.source || row.sourceText === filters.source;
      return (
        matchesSearch &&
        matchesDepartment &&
        matchesRole &&
        matchesStatus &&
        matchesSource
      );
    });
  }, [rows, filters]);

  return (
    <section className="space-y-2 rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
      {isPending ? <Spin aria-label="组织数据加载中" /> : null}
      <MessageError
        active={Boolean(firstError)}
        cause={firstError}
        title="组织数据加载失败"
      />
      <UserFilterBar
        departmentOptions={departmentOptions}
        statusOptions={statusOptions}
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />
      <UserTable rows={filteredRows} />
    </section>
  );
}
