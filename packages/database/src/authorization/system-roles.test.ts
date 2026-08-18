import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  SYSTEM_ROLE_DEFINITIONS,
  SYSTEM_ROLE_PERMISSION_MAP,
} from "./system-roles.js";

describe("system role registry", () => {
  it("defines one canonical permission package per system role", () => {
    const roleCodes = SYSTEM_ROLE_DEFINITIONS.map((role) => role.roleCode);
    expect(new Set(roleCodes).size).toBe(roleCodes.length);
    expect(SYSTEM_ROLE_PERMISSION_MAP.get("employee")).toContain(
      PERMISSIONS.CATALOG_READ,
    );
    expect(SYSTEM_ROLE_PERMISSION_MAP.get("employee")).toContain(
      PERMISSIONS.APPLICATION_CREATE,
    );
    expect(SYSTEM_ROLE_PERMISSION_MAP.get("employee")).toContain(
      PERMISSIONS.APPLICATION_PUBLISH,
    );
    expect(SYSTEM_ROLE_PERMISSION_MAP.get("demand_operator")).toContain(
      PERMISSIONS.APPLICATION_CREATE,
    );
    expect(SYSTEM_ROLE_PERMISSION_MAP.get("super_admin")).toEqual(["*"]);
    expect(
      SYSTEM_ROLE_DEFINITIONS.some((role) =>
        role.permissions.some(
          (permission) => permission === "marketplace.read",
        ),
      ),
    ).toBe(false);
  });

  it("grants notification.create to every role that can trigger a notification queue", () => {
    for (const roleCode of [
      "employee",
      "application_admin",
      "demand_operator",
      "demand_reviewer",
      "risk_operator",
      "analytics_operator",
      "analytics_exporter",
      "analytics_assistant_user",
    ]) {
      expect(SYSTEM_ROLE_PERMISSION_MAP.get(roleCode)).toContain(
        PERMISSIONS.NOTIFICATION_CREATE,
      );
    }
  });
});
