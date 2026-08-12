import type { Insertable } from "kysely";
import type { DatabaseSchema } from "../../schema.js";
import {
  DEMO_DEPARTMENT_DEFINITIONS,
  DEMO_ACCOUNT_DEFINITIONS,
} from "../../demo-seed.js";
import { daysAgo } from "../time-utils.js";

/**
 * Rows produced by {@link buildIdentityFixture}.
 *
 * The orchestrator (Task 13) will upsert each array into the corresponding
 * database table.  All `created_at` / `updated_at` timestamps are derived
 * from the `anchor` via {@link daysAgo}.
 */
export interface IdentityFixtureData {
  departments: Array<Insertable<DatabaseSchema["departments"]>>;
  employees: Array<Insertable<DatabaseSchema["employees"]>>;
  departmentMemberships: Array<
    Insertable<DatabaseSchema["department_memberships"]>
  >;
  employeeRoles: Array<Insertable<DatabaseSchema["employee_roles"]>>;
  identityAuditEvents: Array<
    Insertable<DatabaseSchema["identity_audit_events"]>
  >;
}

/**
 * Build the identity fixture from the existing demo account and department
 * definitions.
 *
 * Produces:
 * - 4 departments (from {@link DEMO_DEPARTMENT_DEFINITIONS})
 * - 5 employees (from {@link DEMO_ACCOUNT_DEFINITIONS})
 * - 5 department memberships (one primary per employee)
 * - 9 employee-role assignments (all role codes across all accounts)
 * - 6 identity audit events (5 login + 1 profile-update)
 */
export function buildIdentityFixture(anchor: Date): IdentityFixtureData {
  // ── departments (4) ──────────────────────────────────────────────────────

  const departments: Array<Insertable<DatabaseSchema["departments"]>> =
    DEMO_DEPARTMENT_DEFINITIONS.map((d) => ({
      department_id: d.departmentId,
      name: d.name,
      parent_department_id: d.parentDepartmentId,
      source: "local" as const,
      created_at: daysAgo(anchor, 90),
      updated_at: daysAgo(anchor, 90),
    }));

  // ── employees (5) ────────────────────────────────────────────────────────

  const employees: Array<Insertable<DatabaseSchema["employees"]>> =
    DEMO_ACCOUNT_DEFINITIONS.map((a) => ({
      employee_id: a.employeeId,
      display_name: a.displayName,
      status: "active" as const,
      primary_department_id: a.primaryDepartmentId,
      password_reset_required: false,
      password_hash: "",
      employee_number: null,
      created_at: daysAgo(anchor, 90),
      updated_at: daysAgo(anchor, 90),
    }));

  // ── department memberships (5) ───────────────────────────────────────────

  const departmentMemberships: Array<
    Insertable<DatabaseSchema["department_memberships"]>
  > = DEMO_ACCOUNT_DEFINITIONS.map((a) => ({
    employee_id: a.employeeId,
    department_id: a.primaryDepartmentId,
    is_primary: true,
  }));

  // ── employee roles (9) ───────────────────────────────────────────────────

  const employeeRoles: Array<Insertable<DatabaseSchema["employee_roles"]>> =
    DEMO_ACCOUNT_DEFINITIONS.flatMap((a) =>
      a.roleCodes.map((roleCode) => ({
        employee_id: a.employeeId,
        role_code: roleCode,
      })),
    );

  // ── identity audit events (6) ────────────────────────────────────────────

  // 5 login events — one per account, spread across the last 30 days.
  const loginEvents: Array<
    Insertable<DatabaseSchema["identity_audit_events"]>
  > = DEMO_ACCOUNT_DEFINITIONS.map((a, i) => ({
    actor_employee_id: a.employeeId,
    event_type: "login",
    subject_employee_id: a.employeeId,
    details: { method: "password" },
    created_at: daysAgo(anchor, 30 - i),
  }));

  // 1 extra event: the super admin updates the regular employee's profile.
  const extraEvent: Insertable<DatabaseSchema["identity_audit_events"]> = {
    actor_employee_id: DEMO_ACCOUNT_DEFINITIONS[4]!.employeeId,
    event_type: "profile_updated",
    subject_employee_id: DEMO_ACCOUNT_DEFINITIONS[0]!.employeeId,
    details: { field: "display_name" },
    created_at: daysAgo(anchor, 15),
  };

  const identityAuditEvents = [...loginEvents, extraEvent];

  // ── assemble ─────────────────────────────────────────────────────────────

  return {
    departments,
    employees,
    departmentMemberships,
    employeeRoles,
    identityAuditEvents,
  };
}
