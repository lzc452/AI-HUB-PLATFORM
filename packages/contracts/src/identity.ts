export type EmployeeId = string;
export type ResourceId = string;

export const PERMISSIONS = Object.freeze({
  IDENTITY_EMPLOYEE_READ: "identity.employee.read",
  IDENTITY_DEPARTMENT_READ: "identity.department.read",
  IDENTITY_ROLE_READ: "identity.role.read",
  IDENTITY_SESSION_MANAGE: "identity.session.manage",
  IDENTITY_EMPLOYEE_MANAGE: "identity.employee.manage",
  IDENTITY_DEPARTMENT_MANAGE: "identity.department.manage",
  IDENTITY_ROLE_MANAGE: "identity.role.manage",
  IDENTITY_SYNC_MANAGE: "identity.sync.manage",
  IDENTITY_SYNC_RUN: "identity.sync.run",
  SECURITY_AUDIT_EXPORT: "security.audit.export",
  CATALOG_READ: "catalog.read",
  APPLICATION_CREATE: "application.create",
  APPLICATION_READ: "application.read",
  APPLICATION_UPDATE: "application.update",
  APPLICATION_REVIEW: "application.review",
  APPLICATION_PUBLISH: "application.publish",
  APPLICATION_MANAGE: "application.manage",
  CREATOR_READ: "creator.read",
  DEMAND_CREATE: "demand.create",
  DEMAND_READ: "demand.read",
  DEMAND_UPDATE: "demand.update",
  DEMAND_SUBMIT: "demand.submit",
  DEMAND_REVIEW: "demand.review",
  DEMAND_CLAIM: "demand.claim",
  DEMAND_COLLABORATE: "demand.collaborate",
  DEMAND_PRIORITIZE: "demand.prioritize",
  DEMAND_PROGRESS: "demand.progress",
  DEMAND_MANAGE: "demand.manage",
  DEMAND_MERGE: "demand.merge",
  DEMAND_ASSOCIATE_APPLICATION: "demand.associate_application",
  DEMAND_INTERACT: "demand.interact",
  DEMAND_MODERATE: "demand.moderate",
  DEMAND_ANONYMOUS_AUDIT: "demand.anonymous_audit",
  INTERACTION_INTERACT: "interaction.interact",
  INTERACTION_MODERATE: "interaction.moderate",
  INTERACTION_ANONYMOUS_AUDIT: "interaction.anonymous_audit",
  NOTIFICATION_READ: "notification.read",
  NOTIFICATION_DELIVER: "notification.deliver",
  SECURITY_READ: "security.read",
  ANALYTICS_PLATFORM_READ: "analytics.platform.read",
  ANALYTICS_MARKET_READ: "analytics.market.read",
  ANALYTICS_APPLICATION_READ: "analytics.application.read",
  ANALYTICS_INNOVATION_READ: "analytics.innovation.read",
  ANALYTICS_REVIEW_READ: "analytics.review.read",
  ANALYTICS_DEPARTMENT_READ: "analytics.department.read",
  ANALYTICS_RISK_READ: "analytics.risk.read",
  ANALYTICS_RUNTIME_READ: "analytics.runtime.read",
  ANALYTICS_INTEGRATION_READ: "analytics.integration.read",
  ANALYTICS_EXPORT: "analytics.export",
  ANALYTICS_EXPORT_MANAGE: "analytics.export.manage",
  ANALYTICS_IDENTITY_EXPORT: "analytics.identity.export",
  ANALYTICS_ASSISTANT_USE: "analytics.assistant.use",
  ANALYTICS_SCOPE_ALL: "analytics.scope.all",
} as const);

export const PERMISSION_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
    [PERMISSIONS.IDENTITY_EMPLOYEE_READ]: "员工查看",
    [PERMISSIONS.IDENTITY_DEPARTMENT_READ]: "部门查看",
    [PERMISSIONS.IDENTITY_ROLE_READ]: "角色查看",
    [PERMISSIONS.IDENTITY_SESSION_MANAGE]: "会话管理",
    [PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE]: "员工管理",
    [PERMISSIONS.IDENTITY_DEPARTMENT_MANAGE]: "部门管理",
    [PERMISSIONS.IDENTITY_ROLE_MANAGE]: "角色管理",
    [PERMISSIONS.IDENTITY_SYNC_MANAGE]: "同步配置管理",
    [PERMISSIONS.IDENTITY_SYNC_RUN]: "同步运行",
    [PERMISSIONS.SECURITY_AUDIT_EXPORT]: "安全审计导出",
    [PERMISSIONS.CATALOG_READ]: "应用目录查看",
    [PERMISSIONS.APPLICATION_CREATE]: "应用创建",
    [PERMISSIONS.APPLICATION_READ]: "应用查看",
    [PERMISSIONS.APPLICATION_UPDATE]: "应用更新",
    [PERMISSIONS.APPLICATION_REVIEW]: "应用审核",
    [PERMISSIONS.APPLICATION_PUBLISH]: "应用发布",
    [PERMISSIONS.APPLICATION_MANAGE]: "应用管理",
    [PERMISSIONS.CREATOR_READ]: "创作者中心查看",
    [PERMISSIONS.DEMAND_CREATE]: "需求创建",
    [PERMISSIONS.DEMAND_READ]: "需求查看",
    [PERMISSIONS.DEMAND_UPDATE]: "需求更新",
    [PERMISSIONS.DEMAND_SUBMIT]: "需求提交",
    [PERMISSIONS.DEMAND_REVIEW]: "需求审核",
    [PERMISSIONS.DEMAND_CLAIM]: "需求认领",
    [PERMISSIONS.DEMAND_COLLABORATE]: "需求协作",
    [PERMISSIONS.DEMAND_PRIORITIZE]: "需求优先级",
    [PERMISSIONS.DEMAND_PROGRESS]: "需求进展",
    [PERMISSIONS.DEMAND_MANAGE]: "需求管理",
    [PERMISSIONS.DEMAND_MERGE]: "需求合并",
    [PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION]: "关联应用",
    [PERMISSIONS.DEMAND_INTERACT]: "需求互动",
    [PERMISSIONS.DEMAND_MODERATE]: "需求内容管理",
    [PERMISSIONS.DEMAND_ANONYMOUS_AUDIT]: "需求匿名审核",
    [PERMISSIONS.INTERACTION_INTERACT]: "互动参与",
    [PERMISSIONS.INTERACTION_MODERATE]: "互动内容管理",
    [PERMISSIONS.INTERACTION_ANONYMOUS_AUDIT]: "互动匿名审核",
    [PERMISSIONS.NOTIFICATION_READ]: "通知查看",
    [PERMISSIONS.NOTIFICATION_DELIVER]: "通知投递",
    [PERMISSIONS.SECURITY_READ]: "安全查看",
    [PERMISSIONS.ANALYTICS_PLATFORM_READ]: "平台分析查看",
    [PERMISSIONS.ANALYTICS_MARKET_READ]: "市场分析查看",
    [PERMISSIONS.ANALYTICS_APPLICATION_READ]: "应用分析查看",
    [PERMISSIONS.ANALYTICS_INNOVATION_READ]: "创新分析查看",
    [PERMISSIONS.ANALYTICS_REVIEW_READ]: "审核分析查看",
    [PERMISSIONS.ANALYTICS_DEPARTMENT_READ]: "部门分析查看",
    [PERMISSIONS.ANALYTICS_RISK_READ]: "风险分析查看",
    [PERMISSIONS.ANALYTICS_RUNTIME_READ]: "运行时分析查看",
    [PERMISSIONS.ANALYTICS_INTEGRATION_READ]: "集成分析查看",
    [PERMISSIONS.ANALYTICS_EXPORT]: "分析导出",
    [PERMISSIONS.ANALYTICS_EXPORT_MANAGE]: "分析导出管理",
    [PERMISSIONS.ANALYTICS_IDENTITY_EXPORT]: "身份分析导出",
    [PERMISSIONS.ANALYTICS_ASSISTANT_USE]: "分析助手使用",
    [PERMISSIONS.ANALYTICS_SCOPE_ALL]: "全量分析范围",
    "*": "全局权限",
  });

export const PERMISSION_GROUP_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
    identity: "身份与组织",
    security: "安全",
    catalog: "应用目录",
    application: "应用",
    creator: "创作者中心",
    demand: "创新需求",
    interaction: "互动",
    notification: "通知",
    analytics: "数据分析",
  });

export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission;
}

export function permissionGroupLabel(group: string): string {
  return PERMISSION_GROUP_LABELS[group] ?? group;
}

export type PermissionCode =
  | (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
  | "*"
  | (string & {});

export function hasPermission(
  actor: Pick<ActorContext, "permissions">,
  permission: PermissionCode,
): boolean {
  return (
    actor.permissions?.includes("*") === true ||
    actor.permissions?.includes(permission) === true
  );
}

export function hasAnyPermission(
  actor: Pick<ActorContext, "permissions">,
  permissions: readonly PermissionCode[],
): boolean {
  return permissions.some((permission) => hasPermission(actor, permission));
}

export function hasAllPermissions(
  actor: Pick<ActorContext, "permissions">,
  permissions: readonly PermissionCode[],
): boolean {
  return permissions.every((permission) => hasPermission(actor, permission));
}

export interface ActorContext {
  employeeId: EmployeeId;
  /** 员工姓名；登录与 actor 接口始终返回，可选以兼容旧上下文/测试夹具。 */
  displayName?: string;
  roleCodes: readonly string[];
  /** 登录和 actor 接口始终返回该字段；可选以兼容内部测试/服务调用者旧上下文。 */
  permissions?: readonly PermissionCode[];
  departmentIds: readonly string[];
  primaryDepartmentId: string;
  sessionId: string;
}

export interface AuthorizationRequest {
  actor: ActorContext;
  action: string;
  resourceType: string;
  permission?: PermissionCode;
  resourceId?: ResourceId;
  audience?: {
    departmentId?: string;
  };
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: string;
}

export interface EmployeeSummary {
  employeeId: EmployeeId;
  displayName: string;
  status: "pending_binding" | "active" | "disabled" | "archived";
  primaryDepartmentId: string;
  /** 激活角色展示名（员工可能拥有多个角色）。 */
  roleNames?: readonly string[];
  /** 最近一次登录时间（无会话记录时为 null）。 */
  lastLoginAt?: string | null;
}

export interface DepartmentSummary {
  departmentId: string;
  name: string;
  parentDepartmentId: string | null;
  source: "local" | "dingtalk";
  status?: "active" | "disabled";
  managerEmployeeId?: string | null;
  lastSyncedAt?: string | null;
  memberCount?: number;
  applicationCount?: number;
}
