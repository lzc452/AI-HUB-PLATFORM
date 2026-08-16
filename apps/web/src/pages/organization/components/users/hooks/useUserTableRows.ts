import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import type { DepartmentSummary, EmployeeSummary } from "@ai-hub/contracts";

import type { UserTableRow } from "../../constants";

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "")
    .slice(0, 16);
}

/**
 * 纯派生 hook：把 employees + departments 两个查询收敛为表格行。
 * 不引入任何本地可变状态，仅依赖入参查询，保证数据来源单一、可预测。
 */
export function useUserTableRows(
  employees: UseQueryResult<EmployeeSummary[], Error>,
  departments: UseQueryResult<DepartmentSummary[], Error>,
): UserTableRow[] {
  return useMemo(() => {
    if (!employees.data) return [];

    const departmentMap = new Map<string, string>();
    departments.data?.forEach((dept) =>
      departmentMap.set(dept.departmentId, dept.name),
    );

    return employees.data.map((employee) => {
      const department = departments.data?.find(
        (dept) => dept.departmentId === employee.primaryDepartmentId,
      );
      const departmentName =
        departmentMap.get(employee.primaryDepartmentId) ??
        employee.primaryDepartmentId;
      const sourceText = department?.source === "dingtalk" ? "钉钉" : "本地";
      const sourceColor = department?.source === "dingtalk" ? "blue" : "orange";

      return {
        ...employee,
        departmentName,
        lastLogin: formatLastLogin(employee.lastLoginAt),
        roleNames: employee.roleNames ?? [],
        sourceColor,
        sourceText,
      };
    });
  }, [employees.data, departments.data]);
}
