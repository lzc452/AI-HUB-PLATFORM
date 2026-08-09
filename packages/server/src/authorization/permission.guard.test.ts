import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import {
  AUTHORIZATION_METADATA_KEY,
  type AuthorizedRequest,
} from "./authorization.decorator.js";
import { PermissionGuard } from "./permission.guard.js";

const actor: ActorContext = {
  employeeId: "E001",
  roleCodes: ["employee"],
  permissions: [PERMISSIONS.CATALOG_READ],
  departmentIds: ["dept-a"],
  primaryDepartmentId: "dept-a",
  sessionId: "session-1",
};

const context = (
  request: AuthorizedRequest & Record<string, unknown>,
  metadata: unknown,
) => {
  class Handler {}
  class Controller {}
  Reflect.defineMetadata(AUTHORIZATION_METADATA_KEY, metadata, Handler);
  return {
    request,
    getHandler: () => Handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
};

describe("PermissionGuard", () => {
  const identity = {
    getActorContext: async () => actor,
  };

  it("rejects protected routes without identity headers", async () => {
    const guard = new PermissionGuard(new Reflector(), identity as never);
    await expect(
      guard.canActivate(context({}, { authenticated: true })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("hydrates the actor and enforces all required permissions", async () => {
    const guard = new PermissionGuard(new Reflector(), identity as never);
    const request: AuthorizedRequest & Record<string, unknown> = {
      headers: { "x-employee-id": "E001", "x-session-id": "session-1" },
    };
    const allowed = await guard.canActivate(
      context(request, { allOf: [PERMISSIONS.CATALOG_READ] }),
    );
    expect(allowed).toBe(true);
    expect(request.actor).toEqual(actor);

    await expect(
      guard.canActivate(
        context(request, { allOf: [PERMISSIONS.APPLICATION_READ] }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows explicitly public routes without identity", async () => {
    const guard = new PermissionGuard(new Reflector(), undefined);
    await expect(
      guard.canActivate(context({}, { public: true })),
    ).resolves.toBe(true);
  });

  it("denies endpoints without explicit authorization metadata", async () => {
    const guard = new PermissionGuard(new Reflector(), identity as never);
    await expect(
      guard.canActivate(context({}, undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
