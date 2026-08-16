import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserTable } from "./UserTable";
import { UserDetailModal } from "./UserDetailModal";
import type { UserTableRow } from "../constants";

const row: UserTableRow = {
  employeeId: "DEMO-APP-ADMIN",
  displayName: "演示应用管理员",
  status: "active",
  primaryDepartmentId: "demo-rnd",
  roleNames: ["普通员工", "应用管理员"],
  lastLoginAt: "2026-08-15T12:00:00.000Z",
  departmentName: "研发中心",
  lastLogin: "2026-08-15 12:00",
  sourceColor: "blue",
  sourceText: "钉钉",
};

describe("组织用户表格与详情 Modal", () => {
  it("编辑与查看详情都会打开用户详情 Modal", () => {
    const onEdit = vi.fn();
    const onDetail = vi.fn();
    render(<UserTable onDetail={onDetail} onEdit={onEdit} rows={[row]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "编辑 演示应用管理员" }),
    );
    expect(onEdit).toHaveBeenCalledWith(row);
  });

  it("详情 Modal 展示真实角色、来源与最近登录", () => {
    render(<UserDetailModal onClose={vi.fn()} row={row} />);

    expect(screen.getByText("用户详情")).toBeInTheDocument();
    expect(screen.getByText("普通员工")).toBeInTheDocument();
    expect(screen.getByText("应用管理员")).toBeInTheDocument();
    expect(screen.getByText("2026-08-15 12:00")).toBeInTheDocument();
    expect(screen.getByText("钉钉")).toBeInTheDocument();
  });
});
