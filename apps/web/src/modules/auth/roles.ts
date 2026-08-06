import type { ActorContext } from "@ai-hub/contracts";

export const ROLE_APP_ADMIN = "application_admin";
export const ROLE_ORG_ADMIN = "organization_admin";
export const ROLE_SUPER_ADMIN = "super_admin";
export const ROLE_INNOVATION_ADMIN = "innovation_admin";

/**
 * 菜单可见性：actor 未加载（null）时回退为全部可见，避免误隐藏；
 * 已加载时仅在拥有任一允许角色时可见（后端仍执行权限校验）。
 */
export function canSeeMenu(
  actor: ActorContext | null,
  allowedRoles: readonly string[],
): boolean {
  if (!actor) {
    return true;
  }
  return allowedRoles.some((code) => actor.roleCodes.includes(code));
}
