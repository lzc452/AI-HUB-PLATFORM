import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { DepartmentSummary, EmployeeSummary } from "@ai-hub/contracts";

import { UserManagementTab } from "./UserManagementTab";

const { mockRoles } = vi.hoisted(() => ({
  mockRoles: [
    {
      roleId: "employee",
      roleName: "普通员工",
      roleType: "system",
      scope: "按权限授权",
      memberCount: 3,
      creator: null,
      status: "active",
      updatedAt: "2026-08-19T00:00:00.000Z",
    },
    {
      roleId: "super_admin",
      roleName: "超级管理员",
      roleType: "system",
      scope: "全局",
      memberCount: 1,
      creator: null,
      status: "active",
      updatedAt: "2026-08-19T00:00:00.000Z",
    },
    {
      roleId: "application_admin",
      roleName: "应用管理员",
      roleType: "system",
      scope: "按权限授权",
      memberCount: 0,
      creator: null,
      status: "active",
      updatedAt: "2026-08-19T00:00:00.000Z",
    },
    {
      roleId: "demand_operator",
      roleName: "创新运营管理员",
      roleType: "system",
      scope: "按权限授权",
      memberCount: 0,
      creator: null,
      status: "active",
      updatedAt: "2026-08-19T00:00:00.000Z",
    },
  ],
}));

vi.mock("../../../../modules/auth/useIdentity", () => ({
  useApplyEmployeeImport: () => ({ mutateAsync: vi.fn() }),
  useArchiveEmployee: () => ({ mutateAsync: vi.fn() }),
  useBulkDisableEmployees: () => ({ mutateAsync: vi.fn() }),
  useCreateEmployee: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useResetEmployeePassword: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateEmployee: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("../../../../modules/auth/auth.client", () => ({
  previewEmployeeImport: vi.fn(),
}));

vi.mock("../roles/hooks/useRoleRows", () => ({
  useRoleRows: () => ({ data: mockRoles, error: null, isPending: false }),
}));

const employeesQuery = {
  data: [
    {
      employeeId: "E0001",
      displayName: "张三",
      status: "active",
      primaryDepartmentId: "dept-1",
      roleNames: ["普通员工", "应用管理员"],
      lastLoginAt: null,
    },
  ],
  error: null,
  isPending: false,
} as unknown as UseQueryResult<EmployeeSummary[], Error>;

const departmentsQuery = {
  data: [
    {
      departmentId: "dept-1",
      name: "研发中心",
      parentDepartmentId: null,
      source: "local",
    },
  ],
  error: null,
  isPending: false,
} as unknown as UseQueryResult<DepartmentSummary[], Error>;

function renderTab() {
  return render(
    <UserManagementTab
      departments={departmentsQuery}
      employees={employeesQuery}
      firstError={null}
      isPending={false}
    />,
  );
}

async function openRoleSelect() {
  fireEvent.mouseDown(screen.getByLabelText("角色"));
  await waitFor(() => {
    expect(
      document.querySelectorAll(".ant-select-item-option").length,
    ).toBeGreaterThan(0);
  });
}

describe("UserManagementTab 角色选择（V1 收敛）", () => {
  it("新建用户时角色选择器只提供普通员工与超级管理员两个选项", async () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "新建用户" }));
    const dialog = await screen.findByRole("dialog");

    await openRoleSelect();

    const optionContents = Array.from(
      document.querySelectorAll<HTMLElement>(".ant-select-item-option-content"),
    ).map((el) => el.textContent);
    expect(optionContents).toEqual(["普通员工", "超级管理员"]);
    // 非分发角色不进入选择器
    expect(within(dialog).queryByText("应用管理员")).not.toBeInTheDocument();
    expect(screen.queryByText("创新运营管理员")).not.toBeInTheDocument();
  });

  it("编辑已分配非分发角色的用户时，历史角色仍展示且不可再选", async () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "编辑 张三" }));
    const dialog = await screen.findByRole("dialog");

    // 历史已分配角色仍以选中标签展示（编辑保存时原样回传，不被移除）
    await waitFor(() => {
      expect(within(dialog).getByText("应用管理员")).toBeInTheDocument();
    });

    await openRoleSelect();

    // 历史角色为禁用选项；可选（启用）选项仍只有两个
    const disabledOptions = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".ant-select-item-option-disabled",
      ),
    );
    expect(
      disabledOptions.some((el) => el.textContent?.includes("应用管理员")),
    ).toBe(true);
    const enabledOptions = Array.from(
      document.querySelectorAll<HTMLElement>(".ant-select-item-option"),
    ).filter((el) => !el.classList.contains("ant-select-item-option-disabled"));
    expect(enabledOptions.map((el) => el.textContent)).toEqual([
      "普通员工",
      "超级管理员",
    ]);
  });
});
