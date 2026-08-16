import { useQuery } from "@tanstack/react-query";
import {
  listDepartments,
  listEmployees,
} from "../../../../../modules/auth/auth.client";
import type { DepartmentRow } from "../constants";

interface UseDepartmentRowsResult {
  data: DepartmentRow[];
  error: Error | null;
  isPending: boolean;
}

/** 从 identity API 查询部门与成员汇总；缺失的可选字段按空态展示。 */
export function useDepartmentRows(): UseDepartmentRowsResult {
  const departments = useQuery({
    queryKey: ["identity", "departments"],
    queryFn: listDepartments,
  });
  const employees = useQuery({
    queryKey: ["identity", "employees"],
    queryFn: listEmployees,
  });
  const memberCounts = new Map<string, number>();
  for (const employee of employees.data ?? []) {
    memberCounts.set(
      employee.primaryDepartmentId,
      (memberCounts.get(employee.primaryDepartmentId) ?? 0) + 1,
    );
  }
  return {
    data: (departments.data ?? []).map((department) => ({
      applicationCount: department.applicationCount ?? 0,
      departmentId: department.departmentId,
      lastSyncAt: department.lastSyncedAt ?? "—",
      leader: department.managerEmployeeId ?? "—",
      memberCount:
        department.memberCount ??
        memberCounts.get(department.departmentId) ??
        0,
      name: department.name,
      parentDepartmentId: department.parentDepartmentId,
      source: department.source,
      status: department.status ?? "active",
    })),
    error: departments.error ?? employees.error,
    isPending: departments.isPending || employees.isPending,
  };
}
