export type RoleType = "system" | "custom";

export type RoleStatus = "active" | "disabled";

export interface RoleSummary {
  /** 角色 ID */
  roleId: string;
  /** 角色名称 */
  roleName: string;
  /** 角色类型：系统角色 / 自定义角色 */
  roleType: RoleType;
  /** 权限范围 */
  scope: string;
  /** 已分配用户数 */
  memberCount: number;
  /** 创建人 */
  creator: string;
  /** 状态 */
  status: RoleStatus;
  /** 最近更新时间 */
  updatedAt: string;
}

export const ROLE_TYPE_META: Record<RoleType, { color: string; text: string }> =
  {
    custom: { color: "#fa8c16", text: "自定义角色" },
    system: { color: "#1677ff", text: "系统角色" },
  };

export const ROLE_STATUS_META: Record<
  RoleStatus,
  { color: string; text: string }
> = {
  active: { color: "success", text: "启用" },
  disabled: { color: "error", text: "停用" },
};

/** 角色 → 图标与颜色映射（严格使用 @ant-design/icons 已有图标）。 */
export const ROLE_ICON_META: Record<
  string,
  { color: string; iconName: string }
> = {
  保险产品管理员: { color: "#13c2c2", iconName: "InsuranceFilled" },
  创新运营: { color: "#fa8c16", iconName: "FireFilled" },
  内容编辑: { color: "#1677ff", iconName: "FileTextOutlined" },
  客服专员: { color: "#52c41a", iconName: "CustomerServiceFilled" },
  应用管理员: { color: "#52c41a", iconName: "AppstoreFilled" },
  数据分析员: { color: "#13c2c2", iconName: "DatabaseFilled" },
  数据分析师: { color: "#13c2c2", iconName: "DatabaseFilled" },
  审核员: { color: "#fa8c16", iconName: "AuditOutlined" },
  开发者: { color: "#722ed1", iconName: "CodeFilled" },
  普通用户: { color: "#1677ff", iconName: "UserOutlined" },
  项目经理: { color: "#1677ff", iconName: "ProjectFilled" },
  测试工程师: { color: "#722ed1", iconName: "ExperimentFilled" },
  组织管理员: { color: "#722ed1", iconName: "ApartmentOutlined" },
  系统管理员: { color: "#1677ff", iconName: "SafetyCertificateFilled" },
  运维工程师: { color: "#fa8c16", iconName: "ToolFilled" },
  管理员: { color: "#722ed1", iconName: "UserOutlined" },
  财务专员: { color: "#52c41a", iconName: "AccountBookFilled" },
  产品运营: { color: "#fa8c16", iconName: "TagsFilled" },
};

/** 可见 10 条 + 填充 8 条，保证统计总数 18 / 系统 6 / 自定义 12 / 已分配 1286 一致。 */
export const ROLES_MOCK_DATA: RoleSummary[] = [
  {
    creator: "张伟",
    memberCount: 28,
    roleId: "role-admin",
    roleName: "管理员",
    roleType: "system",
    scope: "全局",
    status: "active",
    updatedAt: "2025-06-01 10:20",
  },
  {
    creator: "张伟",
    memberCount: 12,
    roleId: "role-system-admin",
    roleName: "系统管理员",
    roleType: "system",
    scope: "全局",
    status: "active",
    updatedAt: "2025-06-01 09:58",
  },
  {
    creator: "王芳",
    memberCount: 45,
    roleId: "role-app-admin",
    roleName: "应用管理员",
    roleType: "system",
    scope: "应用治理",
    status: "active",
    updatedAt: "2025-05-31 18:42",
  },
  {
    creator: "刘涛",
    memberCount: 16,
    roleId: "role-auditor",
    roleName: "审核员",
    roleType: "system",
    scope: "应用治理",
    status: "active",
    updatedAt: "2025-05-20 11:05",
  },
  {
    creator: "赵强",
    memberCount: 128,
    roleId: "role-developer",
    roleName: "开发者",
    roleType: "custom",
    scope: "应用治理",
    status: "active",
    updatedAt: "2025-05-31 21:16",
  },
  {
    creator: "系统",
    memberCount: 856,
    roleId: "role-normal-user",
    roleName: "普通用户",
    roleType: "system",
    scope: "应用治理",
    status: "active",
    updatedAt: "2025-05-30 17:09",
  },
  {
    creator: "陈晨",
    memberCount: 22,
    roleId: "role-innovation-ops",
    roleName: "创新运营",
    roleType: "custom",
    scope: "市场运营",
    status: "active",
    updatedAt: "2025-05-18 16:33",
  },
  {
    creator: "吴静",
    memberCount: 18,
    roleId: "role-data-analyst",
    roleName: "数据分析员",
    roleType: "custom",
    scope: "市场运营",
    status: "disabled",
    updatedAt: "2025-05-28 15:42",
  },
  {
    creator: "孙悦",
    memberCount: 10,
    roleId: "role-security-auditor",
    roleName: "安全审计员",
    roleType: "custom",
    scope: "审计安全",
    status: "active",
    updatedAt: "2025-05-26 14:11",
  },
  {
    creator: "张伟",
    memberCount: 8,
    roleId: "role-org-admin",
    roleName: "组织管理员",
    roleType: "custom",
    scope: "组织管理",
    status: "active",
    updatedAt: "2025-05-19 10:30",
  },
  // 填充行，保证聚合统计与设计图一致。
  {
    creator: "李明",
    memberCount: 15,
    roleId: "role-finance",
    roleName: "财务专员",
    roleType: "system",
    scope: "财务管理",
    status: "active",
    updatedAt: "2025-05-15 09:00",
  },
  {
    creator: "王芳",
    memberCount: 20,
    roleId: "role-product-ops",
    roleName: "产品运营",
    roleType: "custom",
    scope: "市场运营",
    status: "active",
    updatedAt: "2025-05-14 16:20",
  },
  {
    creator: "陈晨",
    memberCount: 12,
    roleId: "role-content-editor",
    roleName: "内容编辑",
    roleType: "custom",
    scope: "内容运营",
    status: "active",
    updatedAt: "2025-05-13 11:30",
  },
  {
    creator: "李娜",
    memberCount: 35,
    roleId: "role-cs",
    roleName: "客服专员",
    roleType: "custom",
    scope: "客户服务",
    status: "active",
    updatedAt: "2025-05-12 14:50",
  },
  {
    creator: "吴静",
    memberCount: 8,
    roleId: "role-data-analyst-2",
    roleName: "数据分析师",
    roleType: "custom",
    scope: "数据平台",
    status: "active",
    updatedAt: "2025-05-11 10:10",
  },
  {
    creator: "赵强",
    memberCount: 6,
    roleId: "role-qa",
    roleName: "测试工程师",
    roleType: "custom",
    scope: "研发效能",
    status: "disabled",
    updatedAt: "2025-05-10 17:40",
  },
  {
    creator: "刘强",
    memberCount: 19,
    roleId: "role-devops",
    roleName: "运维工程师",
    roleType: "custom",
    scope: "基础设施",
    status: "active",
    updatedAt: "2025-05-09 09:20",
  },
  {
    creator: "张伟",
    memberCount: 28,
    roleId: "role-pm",
    roleName: "项目经理",
    roleType: "custom",
    scope: "项目管理",
    status: "active",
    updatedAt: "2025-05-08 15:00",
  },
];

/** 筛选状态聚合为单一对象。 */
export interface RoleFilterValue {
  searchText: string;
  status: RoleStatus | undefined;
  type: RoleType | undefined;
}

export function createDefaultRoleFilters(): RoleFilterValue {
  return {
    searchText: "",
    status: undefined,
    type: undefined,
  };
}

export function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}
