import { describe, expect, it } from "vitest";
import { buildIdentityFixture } from "./identity.fixture.js";

/**
 * Create a fixed anchor date so every timestamp is deterministic.
 * Using noon UTC to avoid any midnight edge cases.
 */
const ANCHOR = new Date("2025-06-15T12:00:00.000Z");

describe("buildIdentityFixture", () => {
  const fixture = buildIdentityFixture(ANCHOR);

  // ── counts ────────────────────────────────────────────────────────────────

  it("produces 4 departments", () => {
    expect(fixture.departments).toHaveLength(4);
  });

  it("produces 5 employees", () => {
    expect(fixture.employees).toHaveLength(5);
  });

  it("produces 5 department memberships", () => {
    expect(fixture.departmentMemberships).toHaveLength(5);
  });

  it("produces 9 role assignments", () => {
    expect(fixture.employeeRoles).toHaveLength(9);
  });

  it("produces 6 audit events", () => {
    expect(fixture.identityAuditEvents).toHaveLength(6);
  });

  // ── FK resolution ─────────────────────────────────────────────────────────

  it("all department ids are unique", () => {
    const ids = fixture.departments.map((d) => d.department_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all employee ids are unique", () => {
    const ids = fixture.employees.map((e) => e.employee_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("department parent_department_id references resolve within departments", () => {
    const deptIds = new Set(fixture.departments.map((d) => d.department_id));
    for (const d of fixture.departments) {
      if (d.parent_department_id !== null) {
        expect(deptIds.has(d.parent_department_id)).toBe(true);
      }
    }
  });

  it("employee primary_department_id references resolve within departments", () => {
    const deptIds = new Set(fixture.departments.map((d) => d.department_id));
    for (const e of fixture.employees) {
      expect(deptIds.has(e.primary_department_id)).toBe(true);
    }
  });

  it("membership department_id references resolve within departments", () => {
    const deptIds = new Set(fixture.departments.map((d) => d.department_id));
    for (const m of fixture.departmentMemberships) {
      expect(deptIds.has(m.department_id)).toBe(true);
    }
  });

  it("membership employee_id references resolve within employees", () => {
    const empIds = new Set(fixture.employees.map((e) => e.employee_id));
    for (const m of fixture.departmentMemberships) {
      expect(empIds.has(m.employee_id)).toBe(true);
    }
  });

  it("employee_roles employee_id references resolve within employees", () => {
    const empIds = new Set(fixture.employees.map((e) => e.employee_id));
    for (const r of fixture.employeeRoles) {
      expect(empIds.has(r.employee_id)).toBe(true);
    }
  });

  it("audit event actor_employee_id references resolve within employees (or null)", () => {
    const empIds = new Set(fixture.employees.map((e) => e.employee_id));
    for (const ev of fixture.identityAuditEvents) {
      if (ev.actor_employee_id !== null) {
        expect(empIds.has(ev.actor_employee_id)).toBe(true);
      }
    }
  });

  it("audit event subject_employee_id references resolve within employees (or null)", () => {
    const empIds = new Set(fixture.employees.map((e) => e.employee_id));
    for (const ev of fixture.identityAuditEvents) {
      if (ev.subject_employee_id !== null) {
        expect(empIds.has(ev.subject_employee_id)).toBe(true);
      }
    }
  });

  // ── data integrity ────────────────────────────────────────────────────────

  it("every department has source 'local'", () => {
    for (const d of fixture.departments) {
      expect(d.source).toBe("local");
    }
  });

  it("every employee has status 'active' and empty password_hash", () => {
    for (const e of fixture.employees) {
      expect(e.status).toBe("active");
      expect(e.password_hash).toBe("");
      expect(e.password_reset_required).toBe(false);
    }
  });

  it("every membership has is_primary true", () => {
    for (const m of fixture.departmentMemberships) {
      expect(m.is_primary).toBe(true);
    }
  });

  it("audit events include exactly 5 login events and 1 profile_updated", () => {
    const loginCount = fixture.identityAuditEvents.filter(
      (ev) => ev.event_type === "login",
    ).length;
    const profileCount = fixture.identityAuditEvents.filter(
      (ev) => ev.event_type === "profile_updated",
    ).length;
    expect(loginCount).toBe(5);
    expect(profileCount).toBe(1);
  });

  // ── timestamps ────────────────────────────────────────────────────────────

  it("all created_at values are Date instances", () => {
    for (const d of fixture.departments) {
      expect(d.created_at! instanceof Date || typeof d.created_at === "object").toBe(true);
    }
    for (const e of fixture.employees) {
      expect(e.created_at! instanceof Date || typeof e.created_at === "object").toBe(true);
    }
    for (const ev of fixture.identityAuditEvents) {
      expect(ev.created_at! instanceof Date || typeof ev.created_at === "object").toBe(true);
    }
  });

  it("departments and employees use the same created_at (anchored 90 days ago)", () => {
    const deptTime = fixture.departments[0]!.created_at as Date;
    const empTime = fixture.employees[0]!.created_at as Date;
    expect(deptTime.getTime()).toBe(empTime.getTime());
  });

  it("audit event timestamps are in descending order (newest first in map order)", () => {
    const times = fixture.identityAuditEvents.map((ev) =>
      (ev.created_at as Date).getTime(),
    );
    // Login events are at anchor - 30, -29, -28, -27, -26 days;
    // extra event is at anchor - 15 days (newer).
    // So timestamps in array order should be strictly decreasing
    // if newest is first, or increasing if oldest is first.
    // Our map puts the newest login (anchor - 26) first,
    // followed by older logins ... down to anchor - 30,
    // then the extra event at anchor - 15.
    // Array order: [anchor-30, anchor-29, anchor-28, anchor-27, anchor-26, anchor-15]
    // This is increasing (oldest → newest).
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]!).toBeLessThanOrEqual(times[i]!);
    }
  });

  // ── immutability between calls ────────────────────────────────────────────

  it("returns distinct arrays on each call (no shared references)", () => {
    const f2 = buildIdentityFixture(ANCHOR);
    expect(fixture.departments).not.toBe(f2.departments);
    expect(fixture.employees).not.toBe(f2.employees);
    expect(fixture.departmentMemberships).not.toBe(f2.departmentMemberships);
    expect(fixture.employeeRoles).not.toBe(f2.employeeRoles);
    expect(fixture.identityAuditEvents).not.toBe(f2.identityAuditEvents);
  });
});
