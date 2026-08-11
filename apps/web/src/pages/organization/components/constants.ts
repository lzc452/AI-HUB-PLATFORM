import type { EmployeeSummary } from "@ai-hub/contracts";

export const ROLE_OPTIONS = [
  "管理员",
  "应用管理员",
  "开发者",
  "普通用户",
  "系统管理员",
];

export const SOURCE_OPTIONS = ["钉钉", "本地"];

export const STATUS_META: Record<
  EmployeeSummary["status"],
  { color: string; text: string }
> = {
  active: { color: "success", text: "启用" },
  archived: { color: "default", text: "已归档" },
  disabled: { color: "error", text: "停用" },
  pending_binding: { color: "warning", text: "待绑定" },
};

/** 表格行 = 员工基础数据 + 由部门/索引派生的展示字段。 */
export interface UserTableRow extends EmployeeSummary {
  departmentName: string;
  lastLogin: string;
  role: string;
  sourceColor: string;
  sourceText: string;
}

/** 筛选状态聚合为单一对象，避免分散的 useState 造成数据不一致。 */
export interface UserFilterValue {
  department: string | undefined;
  role: string | undefined;
  searchText: string;
  source: string | undefined;
  status: string | undefined;
}

export function createDefaultFilters(): UserFilterValue {
  return {
    department: undefined,
    role: undefined,
    searchText: "",
    source: undefined,
    status: undefined,
  };
}

export function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}
