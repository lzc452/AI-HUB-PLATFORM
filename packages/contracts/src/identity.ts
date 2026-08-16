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
