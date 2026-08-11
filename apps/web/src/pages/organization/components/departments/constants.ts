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
export const DEPARTMENTS_MOCK_DATA: DepartmentRow[] = [
  {
    applicationCount: 28,
    departmentId: "dept-tech",
    lastSyncAt: "2025-06-01 10:20",
    leader: "张伟",
    memberCount: 586,
    name: "技术中心",
    parentDepartmentId: null,
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 16,
    departmentId: "dept-business",
    lastSyncAt: "2025-06-01 08:30",
    leader: "陈晨",
    memberCount: 312,
    name: "业务中心",
    parentDepartmentId: null,
    source: "local",
    status: "active",
  },
  {
    applicationCount: 7,
    departmentId: "dept-market",
    lastSyncAt: "2025-06-01 10:10",
    leader: "孙悦",
    memberCount: 112,
    name: "市场部",
    parentDepartmentId: null,
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 3,
    departmentId: "dept-strategy",
    lastSyncAt: "2025-05-30 17:45",
    leader: "黄俊",
    memberCount: 52,
    name: "战略发展部",
    parentDepartmentId: null,
    source: "local",
    status: "active",
  },
  {
    applicationCount: 1,
    departmentId: "dept-office",
    lastSyncAt: "2025-05-31 18:42",
    leader: "王芳",
    memberCount: 8,
    name: "总裁办",
    parentDepartmentId: null,
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 0,
    departmentId: "dept-risk",
    lastSyncAt: "2025-05-20 11:05",
    leader: "李明",
    memberCount: 0,
    name: "风控部",
    parentDepartmentId: null,
    source: "local",
    status: "disabled",
  },
  {
    applicationCount: 12,
    departmentId: "dept-product",
    lastSyncAt: "2025-06-01 09:58",
    leader: "李小龙",
    memberCount: 128,
    name: "产品部",
    parentDepartmentId: "dept-tech",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 6,
    departmentId: "dept-ops",
    lastSyncAt: "2025-05-31 21:16",
    leader: "赵强",
    memberCount: 42,
    name: "运维部",
    parentDepartmentId: "dept-tech",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 4,
    departmentId: "dept-arch",
    lastSyncAt: "2025-05-30 17:09",
    leader: "张伟",
    memberCount: 24,
    name: "架构部",
    parentDepartmentId: "dept-tech",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 3,
    departmentId: "dept-security-tech",
    lastSyncAt: "2025-05-31 16:33",
    leader: "赵强",
    memberCount: 18,
    name: "安全技术部",
    parentDepartmentId: "dept-tech",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 8,
    departmentId: "dept-data-tech",
    lastSyncAt: "2025-06-01 10:10",
    leader: "王芳",
    memberCount: 56,
    name: "数据技术部",
    parentDepartmentId: "dept-tech",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 2,
    departmentId: "dept-quality",
    lastSyncAt: "2025-05-30 17:45",
    leader: "刘涛",
    memberCount: 14,
    name: "质量管理部",
    parentDepartmentId: "dept-tech",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 8,
    departmentId: "dept-rd",
    lastSyncAt: "2025-06-01 09:55",
    leader: "王芳",
    memberCount: 68,
    name: "研发部",
    parentDepartmentId: "dept-product",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 4,
    departmentId: "dept-qa",
    lastSyncAt: "2025-05-31 18:42",
    leader: "刘涛",
    memberCount: 35,
    name: "测试部",
    parentDepartmentId: "dept-product",
    source: "local",
    status: "active",
  },
  {
    applicationCount: 2,
    departmentId: "dept-ux",
    lastSyncAt: "2025-05-31 21:16",
    leader: "李小龙",
    memberCount: 12,
    name: "用户体验部",
    parentDepartmentId: "dept-product",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 6,
    departmentId: "dept-finance",
    lastSyncAt: "2025-05-30 17:09",
    leader: "周磊",
    memberCount: 86,
    name: "财务部",
    parentDepartmentId: "dept-business",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 5,
    departmentId: "dept-hr",
    lastSyncAt: "2025-05-31 16:33",
    leader: "吴静",
    memberCount: 74,
    name: "人力资源部",
    parentDepartmentId: "dept-business",
    source: "local",
    status: "active",
  },
  {
    applicationCount: 3,
    departmentId: "dept-legal",
    lastSyncAt: "2025-05-30 17:45",
    leader: "周磊",
    memberCount: 32,
    name: "法务部",
    parentDepartmentId: "dept-business",
    source: "local",
    status: "active",
  },
  {
    applicationCount: 2,
    departmentId: "dept-admin",
    lastSyncAt: "2025-05-31 18:42",
    leader: "吴静",
    memberCount: 28,
    name: "行政部",
    parentDepartmentId: "dept-business",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 1,
    departmentId: "dept-compliance",
    lastSyncAt: "2025-05-20 11:05",
    leader: "周磊",
    memberCount: 11,
    name: "合规部",
    parentDepartmentId: "dept-business",
    source: "local",
    status: "disabled",
  },
  {
    applicationCount: 1,
    departmentId: "dept-training",
    lastSyncAt: "2025-05-31 16:33",
    leader: "吴静",
    memberCount: 9,
    name: "培训部",
    parentDepartmentId: "dept-hr",
    source: "local",
    status: "active",
  },
  {
    applicationCount: 4,
    departmentId: "dept-brand",
    lastSyncAt: "2025-06-01 09:55",
    leader: "孙悦",
    memberCount: 36,
    name: "品牌部",
    parentDepartmentId: "dept-market",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 5,
    departmentId: "dept-sales",
    lastSyncAt: "2025-05-30 17:09",
    leader: "孙悦",
    memberCount: 74,
    name: "销售部",
    parentDepartmentId: "dept-market",
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 5,
    departmentId: "dept-customer",
    lastSyncAt: "2025-05-31 21:16",
    leader: "陈晨",
    memberCount: 45,
    name: "客户成功部",
    parentDepartmentId: null,
    source: "dingtalk",
    status: "active",
  },
  {
    applicationCount: 2,
    departmentId: "dept-partner",
    lastSyncAt: "2025-05-30 17:45",
    leader: "黄俊",
    memberCount: 22,
    name: "合作伙伴部",
    parentDepartmentId: null,
    source: "local",
    status: "active",
  },
  {
    applicationCount: 1,
    departmentId: "dept-research",
    lastSyncAt: "2025-05-31 18:42",
    leader: "黄俊",
    memberCount: 16,
    name: "行业研究部",
    parentDepartmentId: null,
    source: "dingtalk",
    status: "active",
  },
];

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
