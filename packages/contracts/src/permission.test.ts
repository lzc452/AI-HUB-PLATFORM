import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type ActorContext,
} from "./index.js";

const actor: ActorContext = {
  employeeId: "E001",
  roleCodes: ["employee"],
  permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.NOTIFICATION_READ],
  departmentIds: ["dept-a"],
  primaryDepartmentId: "dept-a",
  sessionId: "session-1",
};

describe("permission helpers", () => {
  it("matches explicit permissions and the wildcard", () => {
    expect(hasPermission(actor, PERMISSIONS.CATALOG_READ)).toBe(true);
    expect(hasPermission(actor, PERMISSIONS.APPLICATION_READ)).toBe(false);
    expect(
      hasPermission(
        { ...actor, permissions: ["*"] },
        PERMISSIONS.APPLICATION_READ,
      ),
    ).toBe(true);
  });

  it("evaluates any-of and all-of requirements", () => {
    expect(
      hasAnyPermission(actor, [
        PERMISSIONS.APPLICATION_READ,
        PERMISSIONS.CATALOG_READ,
      ]),
    ).toBe(true);
    expect(
      hasAllPermissions(actor, [
        PERMISSIONS.CATALOG_READ,
        PERMISSIONS.NOTIFICATION_READ,
      ]),
    ).toBe(true);
    expect(
      hasAllPermissions(actor, [
        PERMISSIONS.CATALOG_READ,
        PERMISSIONS.APPLICATION_READ,
      ]),
    ).toBe(false);
  });
});
