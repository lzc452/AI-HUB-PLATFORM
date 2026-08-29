import {
  createParamDecorator,
  SetMetadata,
  type CustomDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { ActorContext, PermissionCode } from "@ai-hub/contracts";

export const AUTHORIZATION_METADATA_KEY = "authorization:requirements";

export interface AuthorizationMetadata {
  public?: boolean;
  authenticated?: boolean;
  /** 可选认证：无凭据时以匿名身份放行；有凭据时按常规校验（失败抛 401）。 */
  optionalAuth?: boolean;
  allOf?: readonly PermissionCode[];
  anyOf?: readonly PermissionCode[];
}

export interface AuthorizedRequest {
  headers?: Record<string, string | string[] | undefined>;
  actor?: ActorContext;
}

export const Public = (): CustomDecorator<string> =>
  SetMetadata(AUTHORIZATION_METADATA_KEY, { public: true });

export const Authenticated = (): CustomDecorator<string> =>
  SetMetadata(AUTHORIZATION_METADATA_KEY, { authenticated: true });

export const OptionalAuth = (): CustomDecorator<string> =>
  SetMetadata(AUTHORIZATION_METADATA_KEY, { optionalAuth: true });

export function RequiresPermissions(
  permissions:
    | PermissionCode
    | readonly PermissionCode[]
    | AuthorizationMetadata,
): CustomDecorator<string> {
  const metadata: AuthorizationMetadata =
    typeof permissions === "string"
      ? { allOf: [permissions] }
      : Array.isArray(permissions)
        ? { allOf: permissions }
        : (permissions as AuthorizationMetadata);
  return SetMetadata(AUTHORIZATION_METADATA_KEY, metadata);
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorContext => {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    if (request.actor === undefined) {
      throw new Error("ACTOR_NOT_AVAILABLE");
    }
    return request.actor;
  },
);

/** 可选认证端点使用：无凭据（匿名）时返回 undefined，有凭据时返回已解析的 actor。 */
export const CurrentActorOrNull = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorContext | undefined => {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    return request.actor;
  },
);
