import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DepartmentSummary, EmployeeSummary } from "@ai-hub/contracts";

import { useUserTableRows } from "./hooks/useUserTableRows";

const departments: DepartmentSummary[] = [
  {
    departmentId: "demo-rnd",
    name: "研发中心",
    parentDepartmentId: "demo-company",
    source: "dingtalk",
  },
];

const employees: EmployeeSummary[] = [
  {
    employeeId: "DEMO-EMPLOYEE",
    displayName: "演示普通员工",
    status: "active",
    primaryDepartmentId: "demo-rnd",
    roleNames: ["普通员工"],
    lastLoginAt: "2026-08-15T12:00:00.000Z",
  },
  {
    employeeId: "DEMO-APP-ADMIN",
    displayName: "演示应用管理员",
    status: "active",
    primaryDepartmentId: "demo-rnd",
    roleNames: ["普通员工", "应用管理员"],
    lastLoginAt: null,
  },
];

function queryResult<T>(data: T) {
  return {
    data,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    refetch: () => Promise.resolve({ data }),
    status: "success",
  } as const;
}

describe("useUserTableRows", () => {
  it("使用真实角色与最近登录数据，不再按索引伪造", () => {
    const { result } = renderHook(() =>
      useUserTableRows(
        queryResult(employees) as never,
        queryResult(departments) as never,
      ),
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toMatchObject({
      employeeId: "DEMO-EMPLOYEE",
      roleNames: ["普通员工"],
      lastLogin: "2026-08-15 12:00",
      sourceText: "钉钉",
    });
    expect(result.current[1]).toMatchObject({
      roleNames: ["普通员工", "应用管理员"],
      lastLogin: "—",
    });
    expect(
      result.current.every((row) => !row.lastLogin.includes("2025-06")),
    ).toBe(true);
  });
});
