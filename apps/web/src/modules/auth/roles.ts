import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";

export type PermissionRequirement = {
  allOf?: readonly string[];
  anyOf?: readonly string[];
};

type ActorWithPermissions = ActorContext & {
  permissions?: readonly string[];
};

function getPermissions(actor: ActorContext | null): readonly string[] {
  return (actor as ActorWithPermissions | null)?.permissions ?? [];
}

export function hasPermission(
  actor: ActorContext | null,
  permission: string,
): boolean {
  const permissions = getPermissions(actor);
  return permissions.includes("*") || permissions.includes(permission);
}

export function canAccess(
  actor: ActorContext | null,
  requirement?: PermissionRequirement,
): boolean {
  if (!actor) {
    return false;
  }
  if (!requirement) {
    return true;
  }
  const allOf = requirement.allOf ?? [];
  const anyOf = requirement.anyOf ?? [];
  return (
    allOf.every((permission) => hasPermission(actor, permission)) &&
    (anyOf.length === 0 ||
      anyOf.some((permission) => hasPermission(actor, permission)))
  );
}

export const ROUTE_ACCESS = {
  analytics: {
    anyOf: [
      PERMISSIONS.ANALYTICS_PLATFORM_READ,
      PERMISSIONS.ANALYTICS_MARKET_READ,
      PERMISSIONS.ANALYTICS_APPLICATION_READ,
      PERMISSIONS.ANALYTICS_INNOVATION_READ,
      PERMISSIONS.ANALYTICS_REVIEW_READ,
      PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
      PERMISSIONS.ANALYTICS_RISK_READ,
      PERMISSIONS.ANALYTICS_RUNTIME_READ,
      PERMISSIONS.ANALYTICS_INTEGRATION_READ,
    ],
  },
  assistant: { allOf: [PERMISSIONS.ANALYTICS_ASSISTANT_USE] },
  applications: {
    anyOf: [PERMISSIONS.APPLICATION_MANAGE, PERMISSIONS.APPLICATION_REVIEW],
  },
  applicationDetail: { allOf: [PERMISSIONS.APPLICATION_READ] },
  applicationVersions: { allOf: [PERMISSIONS.APPLICATION_READ] },
  applicationReview: { allOf: [PERMISSIONS.APPLICATION_REVIEW] },
  applicationDelivery: { allOf: [PERMISSIONS.APPLICATION_UPDATE] },
  creator: { allOf: [PERMISSIONS.CREATOR_READ] },
  innovation: { allOf: [PERMISSIONS.DEMAND_READ] },
  innovationDetail: { allOf: [PERMISSIONS.DEMAND_READ] },
  marketplace: { allOf: [PERMISSIONS.CATALOG_READ] },
  marketplaceDetail: { allOf: [PERMISSIONS.CATALOG_READ] },
  notifications: { allOf: [PERMISSIONS.NOTIFICATION_READ] },
  organization: {
    allOf: [
      PERMISSIONS.IDENTITY_EMPLOYEE_READ,
      PERMISSIONS.IDENTITY_DEPARTMENT_READ,
    ],
  },
  security: { allOf: [PERMISSIONS.SECURITY_READ] },
} as const satisfies Record<string, PermissionRequirement>;
