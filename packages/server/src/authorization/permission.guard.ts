import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import type { CanActivate } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  hasAllPermissions,
  hasAnyPermission,
  type ActorContext,
} from "@ai-hub/contracts";
import { IdentityService } from "../identity/identity.service.js";
import {
  AUTHORIZATION_METADATA_KEY,
  type AuthorizedRequest,
  type AuthorizationMetadata,
} from "./authorization.decorator.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  public constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Optional()
    @Inject(IdentityService)
    private readonly identity?: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<AuthorizationMetadata>(
      AUTHORIZATION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (metadata === undefined) {
      throw new ForbiddenException("AUTHORIZATION_METADATA_REQUIRED");
    }

    if (metadata.public === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const employeeId = this.readHeader(request, "x-employee-id");
    const sessionId = this.readHeader(request, "x-session-id");
    if (employeeId === undefined || sessionId === undefined) {
      throw new UnauthorizedException("IDENTITY_HEADERS_REQUIRED");
    }
    if (this.identity === undefined) {
      throw new UnauthorizedException("IDENTITY_SERVICE_UNAVAILABLE");
    }

    let actor: ActorContext;
    try {
      actor = await this.identity.getActorContext(employeeId, sessionId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "SESSION_INVALID";
      throw new UnauthorizedException(reason);
    }
    request.actor = actor;

    if (
      metadata.allOf !== undefined &&
      !hasAllPermissions(actor, metadata.allOf)
    ) {
      throw new ForbiddenException("NOT_AUTHORIZED");
    }
    if (
      metadata.anyOf !== undefined &&
      !hasAnyPermission(actor, metadata.anyOf)
    ) {
      throw new ForbiddenException("NOT_AUTHORIZED");
    }
    return true;
  }

  private readHeader(
    request: AuthorizedRequest,
    name: string,
  ): string | undefined {
    const value = request.headers?.[name];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
