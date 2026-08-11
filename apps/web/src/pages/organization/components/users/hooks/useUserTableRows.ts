import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import type { DepartmentSummary, EmployeeSummary } from "@ai-hub/contracts";

import { ROLE_OPTIONS, type UserTableRow } from "../../constants";

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

    return employees.data.map((employee, index) => {
      const department = departments.data?.find(
        (dept) => dept.departmentId === employee.primaryDepartmentId,
      );
      const departmentName =
        departmentMap.get(employee.primaryDepartmentId) ??
        employee.primaryDepartmentId;
      const sourceText = department?.source === "dingtalk" ? "钉钉" : "本地";
      const sourceColor = department?.source === "dingtalk" ? "blue" : "orange";
      // 后端暂未返回角色与最近登录时间，使用确定性占位数据以保持视觉还原。
      const role = ROLE_OPTIONS[index % ROLE_OPTIONS.length] ?? "普通用户";
      const day = String((index % 30) + 1).padStart(2, "0");
      const hour = String(8 + (index % 14)).padStart(2, "0");
      const minute = String((index * 7) % 60).padStart(2, "0");
      const lastLogin = `2025-06-${day} ${hour}:${minute}`;

      return {
        ...employee,
        departmentName,
        lastLogin,
        role,
        sourceColor,
        sourceText,
      };
    });
  }, [employees.data, departments.data]);
}
