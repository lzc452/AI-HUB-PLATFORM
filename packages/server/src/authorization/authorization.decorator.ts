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
