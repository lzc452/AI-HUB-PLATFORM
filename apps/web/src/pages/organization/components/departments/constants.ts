export type DepartmentStatus = "active" | "disabled";

export type DepartmentSource = "dingtalk" | "local";

export interface DepartmentRow {
  /** 部门 ID */
  departmentId: string;
  /** 部门名称 */
  name: string;
  /** 上级部门 ID */
  parentDepartmentId: string | null;
  /** 部门负责人 */
  leader: string;
  /** 成员数 */
  memberCount: number;
  /** 关联应用数 */
  applicationCount: number;
  /** 状态 */
  status: DepartmentStatus;
  /** 数据来源 */
  source: DepartmentSource;
  /** 最近同步时间 */
  lastSyncAt: string;
}

export const DEPARTMENT_STATUS_META: Record<
  DepartmentStatus,
  { color: string; text: string }
> = {
  active: { color: "success", text: "启用" },
  disabled: { color: "error", text: "停用" },
};

export const DEPARTMENT_SOURCE_META: Record<
  DepartmentSource,
  { color: string; text: string }
> = {
  dingtalk: { color: "#1677ff", text: "钉钉" },
  local: { color: "#fa8c16", text: "本地" },
};

/** 26 条部门 mock 数据，前 10 条与设计图逐字对齐；2 条停用保证启用部门 = 24。 */
/** 筛选状态聚合为单一对象。 */
export interface DepartmentFilterValue {
  searchText: string;
  source: DepartmentSource | undefined;
  status: DepartmentStatus | undefined;
}

export function createDefaultDepartmentFilters(): DepartmentFilterValue {
  return {
    searchText: "",
    source: undefined,
    status: undefined,
  };
}

export interface DepartmentTreeNode extends DepartmentRow {
  children?: DepartmentTreeNode[];
}

/** 设计图默认展开的行：技术中心、产品部、业务中心。 */
export const DEFAULT_EXPANDED_DEPARTMENT_IDS = [
  "dept-tech",
  "dept-product",
  "dept-business",
];

/**
 * 按筛选条件过滤部门行，同时保留匹配行的所有祖先，
 * 保证树形表格中子节点可见时父节点也在视图中。
 */
export function filterDepartmentRows(
  rows: DepartmentRow[],
  filters: DepartmentFilterValue,
): DepartmentRow[] {
  if (!filters.searchText && !filters.status && !filters.source) {
    return rows;
  }

  const lowerSearch = filters.searchText.toLowerCase();

  const matches = (row: DepartmentRow): boolean => {
    const matchesSearch =
      !filters.searchText ||
      row.name.toLowerCase().includes(lowerSearch) ||
      row.leader.toLowerCase().includes(lowerSearch);
    const matchesStatus = !filters.status || row.status === filters.status;
    const matchesSource = !filters.source || row.source === filters.source;
    return matchesSearch && matchesStatus && matchesSource;
  };

  const matchedIds = new Set<string>();
  const rowMap = new Map(rows.map((row) => [row.departmentId, row]));

  for (const row of rows) {
    if (matches(row)) {
      matchedIds.add(row.departmentId);
      let current: DepartmentRow | undefined = row;
      while (current?.parentDepartmentId) {
        current = rowMap.get(current.parentDepartmentId);
        if (current) {
          matchedIds.add(current.departmentId);
        }
      }
    }
  }

  return rows.filter((row) => matchedIds.has(row.departmentId));
}

/** 将扁平部门列表按 parentDepartmentId 构建为树形结构。 */
export function buildDepartmentTree(
  rows: DepartmentRow[],
): DepartmentTreeNode[] {
  const rowMap = new Map<string, DepartmentTreeNode>();
  for (const row of rows) {
    rowMap.set(row.departmentId, { ...row });
  }

  const roots: DepartmentTreeNode[] = [];
  for (const row of rowMap.values()) {
    if (!row.parentDepartmentId) {
      roots.push(row);
    } else {
      const parent = rowMap.get(row.parentDepartmentId);
      if (parent) {
        parent.children ??= [];
        parent.children.push(row);
      } else {
        // 父节点不在当前集合中（过滤后被剪掉），作为根节点展示
        roots.push(row);
      }
    }
  }

  return roots;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}
