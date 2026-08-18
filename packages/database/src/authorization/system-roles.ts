import { PERMISSIONS, type PermissionCode } from "@ai-hub/contracts";

export interface SystemRoleDefinition {
  roleCode: string;
  name: string;
  permissions: readonly PermissionCode[];
}

const analyticsReadPermissions = [
  PERMISSIONS.ANALYTICS_PLATFORM_READ,
  PERMISSIONS.ANALYTICS_MARKET_READ,
  PERMISSIONS.ANALYTICS_APPLICATION_READ,
  PERMISSIONS.ANALYTICS_INNOVATION_READ,
  PERMISSIONS.ANALYTICS_REVIEW_READ,
  PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
  PERMISSIONS.ANALYTICS_RISK_READ,
  PERMISSIONS.ANALYTICS_RUNTIME_READ,
  PERMISSIONS.ANALYTICS_INTEGRATION_READ,
] as const;

export const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinition[] =
  Object.freeze([
    {
      roleCode: "employee",
      name: "普通员工",
      permissions: [
        PERMISSIONS.CATALOG_READ,
        PERMISSIONS.IDENTITY_DEPARTMENT_READ,
        PERMISSIONS.NOTIFICATION_READ,
        PERMISSIONS.NOTIFICATION_CREATE,
        PERMISSIONS.INTERACTION_INTERACT,
        PERMISSIONS.APPLICATION_CREATE,
        PERMISSIONS.APPLICATION_PUBLISH,
        PERMISSIONS.DEMAND_CREATE,
        PERMISSIONS.DEMAND_READ,
        PERMISSIONS.DEMAND_UPDATE,
        PERMISSIONS.DEMAND_SUBMIT,
        PERMISSIONS.DEMAND_INTERACT,
        PERMISSIONS.APPLICATION_READ,
        PERMISSIONS.APPLICATION_UPDATE,
        PERMISSIONS.CREATOR_READ,
      ],
    },
    {
      roleCode: "application_admin",
      name: "应用管理员",
      permissions: [
        PERMISSIONS.APPLICATION_CREATE,
        PERMISSIONS.APPLICATION_READ,
        PERMISSIONS.APPLICATION_UPDATE,
        PERMISSIONS.APPLICATION_REVIEW,
        PERMISSIONS.APPLICATION_PUBLISH,
        PERMISSIONS.APPLICATION_MANAGE,
        PERMISSIONS.CREATOR_READ,
        PERMISSIONS.NOTIFICATION_CREATE,
        PERMISSIONS.ANALYTICS_APPLICATION_READ,
        PERMISSIONS.ANALYTICS_REVIEW_READ,
      ],
    },
    {
      roleCode: "demand_operator",
      name: "创新运营管理员",
      permissions: [
        PERMISSIONS.APPLICATION_CREATE,
        PERMISSIONS.DEMAND_CREATE,
        PERMISSIONS.DEMAND_READ,
        PERMISSIONS.DEMAND_UPDATE,
        PERMISSIONS.DEMAND_SUBMIT,
        PERMISSIONS.DEMAND_REVIEW,
        PERMISSIONS.DEMAND_CLAIM,
        PERMISSIONS.DEMAND_COLLABORATE,
        PERMISSIONS.DEMAND_PRIORITIZE,
        PERMISSIONS.DEMAND_PROGRESS,
        PERMISSIONS.DEMAND_MANAGE,
        PERMISSIONS.DEMAND_MERGE,
        PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION,
        PERMISSIONS.DEMAND_INTERACT,
        PERMISSIONS.DEMAND_MODERATE,
        PERMISSIONS.DEMAND_ANONYMOUS_AUDIT,
        PERMISSIONS.ANALYTICS_INNOVATION_READ,
        PERMISSIONS.NOTIFICATION_CREATE,
      ],
    },
    {
      roleCode: "demand_reviewer",
      name: "需求审核员",
      permissions: [
        PERMISSIONS.DEMAND_REVIEW,
        PERMISSIONS.DEMAND_CLAIM,
        PERMISSIONS.ANALYTICS_REVIEW_READ,
        PERMISSIONS.NOTIFICATION_CREATE,
      ],
    },
    {
      roleCode: "organization_admin",
      name: "组织管理员",
      permissions: [
        PERMISSIONS.IDENTITY_EMPLOYEE_READ,
        PERMISSIONS.IDENTITY_DEPARTMENT_READ,
        PERMISSIONS.IDENTITY_ROLE_READ,
        PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE,
        PERMISSIONS.IDENTITY_DEPARTMENT_MANAGE,
        PERMISSIONS.IDENTITY_ROLE_MANAGE,
        PERMISSIONS.IDENTITY_SYNC_MANAGE,
        PERMISSIONS.IDENTITY_SYNC_RUN,
        PERMISSIONS.IDENTITY_SESSION_MANAGE,
        PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
      ],
    },
    {
      roleCode: "department_lead",
      name: "部门负责人",
      permissions: [PERMISSIONS.ANALYTICS_DEPARTMENT_READ],
    },
    {
      roleCode: "risk_operator",
      name: "风险运营员",
      permissions: [
        PERMISSIONS.ANALYTICS_RISK_READ,
        PERMISSIONS.INTERACTION_MODERATE,
        PERMISSIONS.NOTIFICATION_CREATE,
      ],
    },
    {
      roleCode: "analytics_operator",
      name: "分析运营员",
      permissions: [
        ...analyticsReadPermissions,
        PERMISSIONS.ANALYTICS_EXPORT,
        PERMISSIONS.ANALYTICS_EXPORT_MANAGE,
        PERMISSIONS.ANALYTICS_ASSISTANT_USE,
        PERMISSIONS.ANALYTICS_SCOPE_ALL,
        PERMISSIONS.NOTIFICATION_CREATE,
      ],
    },
    {
      roleCode: "analytics_exporter",
      name: "分析导出员",
      permissions: [
        ...analyticsReadPermissions,
        PERMISSIONS.ANALYTICS_EXPORT,
        PERMISSIONS.NOTIFICATION_CREATE,
      ],
    },
    {
      roleCode: "analytics_identity_export",
      name: "分析身份导出员",
      permissions: [PERMISSIONS.ANALYTICS_IDENTITY_EXPORT],
    },
    {
      roleCode: "analytics_assistant_user",
      name: "分析助手用户",
      permissions: [
        ...analyticsReadPermissions,
        PERMISSIONS.ANALYTICS_ASSISTANT_USE,
        PERMISSIONS.NOTIFICATION_CREATE,
      ],
    },
    ...(
      [
        ["platform", PERMISSIONS.ANALYTICS_PLATFORM_READ],
        ["market", PERMISSIONS.ANALYTICS_MARKET_READ],
        ["application", PERMISSIONS.ANALYTICS_APPLICATION_READ],
        ["innovation", PERMISSIONS.ANALYTICS_INNOVATION_READ],
        ["review", PERMISSIONS.ANALYTICS_REVIEW_READ],
        ["department", PERMISSIONS.ANALYTICS_DEPARTMENT_READ],
        ["risk", PERMISSIONS.ANALYTICS_RISK_READ],
        ["runtime", PERMISSIONS.ANALYTICS_RUNTIME_READ],
        ["integration", PERMISSIONS.ANALYTICS_INTEGRATION_READ],
      ] as const
    ).flatMap(([key, permission]) => [
      {
        roleCode: `analytics_${key}_reader`,
        name: `${key}分析查看员`,
        permissions: [permission],
      },
    ]),
    {
      roleCode: "super_admin",
      name: "超级管理员",
      permissions: ["*"],
    },
  ]);

export const SYSTEM_ROLE_PERMISSION_MAP: ReadonlyMap<
  string,
  readonly PermissionCode[]
> = new Map(
  SYSTEM_ROLE_DEFINITIONS.map((role) => [role.roleCode, role.permissions]),
);
