import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNT_DEFINITIONS,
  DEMO_ROLE_DEFINITIONS,
} from "./demo-seed.js";

describe("demo seed access-control definitions", () => {
  it("uses the employee base role and additive specialty roles", () => {
    expect(DEMO_ACCOUNT_DEFINITIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: "DEMO-EMPLOYEE",
          roleCodes: ["employee"],
        }),
        expect.objectContaining({
          employeeId: "DEMO-APP-ADMIN",
          roleCodes: ["employee", "application_admin"],
        }),
        expect.objectContaining({
          employeeId: "DEMO-INNOVATION",
          roleCodes: ["employee", "demand_operator"],
        }),
        expect.objectContaining({
          employeeId: "DEMO-ORG-ADMIN",
          roleCodes: ["employee", "organization_admin"],
        }),
        expect.objectContaining({
          employeeId: "DEMO-SUPER-ADMIN",
          roleCodes: ["employee", "super_admin"],
        }),
      ]),
    );
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
