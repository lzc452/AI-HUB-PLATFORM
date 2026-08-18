import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNT_DEFINITIONS,
  DEMO_ROLE_DEFINITIONS,
} from "./demo-seed.js";

describe("demo seed access-control definitions", () => {
  it("distributes only the employee and super_admin roles in V1", () => {
    expect(DEMO_ACCOUNT_DEFINITIONS).toEqual([
      expect.objectContaining({
        employeeId: "DEMO-EMPLOYEE",
        roleCodes: ["employee"],
      }),
      expect.objectContaining({
        employeeId: "DEMO-SUPER-ADMIN",
        roleCodes: ["employee", "super_admin"],
      }),
    ]);
  });

  it("reuses the canonical system role registry without legacy aliases", () => {
    const permissions = DEMO_ROLE_DEFINITIONS.flatMap(
      (role) => role.permissions,
    );

    expect(permissions).not.toContain("marketplace.read");
    expect(permissions).not.toContain("analytics.read");
    expect(DEMO_ROLE_DEFINITIONS.map((role) => role.roleCode)).toContain(
      "application_admin",
    );
    expect(DEMO_ROLE_DEFINITIONS.map((role) => role.roleCode)).toContain(
      "super_admin",
    );
  });
});
