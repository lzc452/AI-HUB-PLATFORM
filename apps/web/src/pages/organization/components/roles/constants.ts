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
