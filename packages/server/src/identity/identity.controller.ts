import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { IdentityService } from "./identity.service.js";

@Controller("/internal/identity")
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get("/employees")
  async listEmployees(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requirePermission(employeeId, sessionId, "read");
    return this.identity.listEmployees();
  }

  @Get("/departments")
  async listDepartments(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requirePermission(employeeId, sessionId, "read");
    return this.identity.listDepartments();
  }

  @Get("/employees/:employeeId/roles")
  async listEmployeeRoles(
    @Param("employeeId") employeeId: string,
    @Headers("x-employee-id") actorEmployeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requirePermission(actorEmployeeId, sessionId, "read");
    return this.identity.listEmployeeRoles(employeeId);
  }

  @Post("/employees/:employeeId/revoke-sessions")
  @HttpCode(200)
  async revokeEmployeeSessions(
    @Param("employeeId") employeeId: string,
    @Headers("x-actor-id") actorEmployeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: { reason?: string },
  ) {
    if (actorEmployeeId === undefined) {
      throw new BadRequestException("ACTOR_ID_REQUIRED");
    }
    await this.requirePermission(actorEmployeeId, sessionId, "manage");
    const revoked = await this.identity.revokeEmployeeSessions(
      actorEmployeeId,
      employeeId,
      body.reason ?? "admin_action",
    );
    return { revoked };
  }

  @Get("/actor")
  getActor(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    return this.identity.getActorContext(employeeId, sessionId);
  }

  @Post("/logout")
  @HttpCode(204)
  async logout(@Body() body: { sessionId?: string }): Promise<void> {
    if (body.sessionId === undefined) {
      throw new BadRequestException("SESSION_ID_REQUIRED");
    }
    await this.identity.revokeSession(body.sessionId);
  }

  @Post("/login/password")
  loginWithPassword(
    @Body()
    body: {
      employeeId: string;
      password: string;
      deviceLabel?: string;
    },
  ) {
    return this.identity
      .loginWithPassword({
        employeeId: body.employeeId,
        password: body.password,
        deviceLabel: body.deviceLabel ?? "browser",
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
          throw new UnauthorizedException("INVALID_CREDENTIALS");
        }
        throw error;
      });
  }

  private async requirePermission(
    employeeId: string | undefined,
    sessionId: string | undefined,
    action: "read" | "manage",
  ): Promise<void> {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    const actor = await this.identity.getActorContext(employeeId, sessionId);
    const decision = await this.identity.authorize({
      actor,
      action,
      resourceType: "identity",
    });
    if (!decision.allowed) {
      throw new ForbiddenException("NOT_AUTHORIZED");
    }
  }
}
