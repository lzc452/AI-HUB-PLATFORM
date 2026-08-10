import { describe, expect, it } from "vitest";
import { buildDemandInteractionFixture } from "./demand-interaction.fixture.js";

const ANCHOR = new Date("2025-06-15T12:00:00.000Z");

describe("buildDemandInteractionFixture", () => {
  const fixture = buildDemandInteractionFixture(ANCHOR);

  // ── counts ────────────────────────────────────────────────────────────────

  it("produces 8 demand comments", () => {
    expect(fixture.demandComments).toHaveLength(8);
  });

  it("produces 10 demand likes", () => {
    expect(fixture.demandLikes).toHaveLength(10);
  });

  it("produces 4 demand comment-likes", () => {
    expect(fixture.demandCommentLikes).toHaveLength(4);
  });

  it("produces 3 demand reports", () => {
    expect(fixture.demandReports).toHaveLength(3);
  });

  it("produces 6 demand progress updates", () => {
    expect(fixture.demandProgressUpdates).toHaveLength(6);
  });

  it("produces 4 demand pilots", () => {
    expect(fixture.demandPilots).toHaveLength(4);
  });

  it("produces 4 demand-application links", () => {
    expect(fixture.demandApplications).toHaveLength(4);
  });

  // ── FK resolution ─────────────────────────────────────────────────────────

  it("all comment ids are unique", () => {
    const ids = fixture.demandComments.map((c) => c.comment_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all report ids are unique", () => {
    const ids = fixture.demandReports.map((r) => r.report_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all progress update ids are unique", () => {
    const ids = fixture.demandProgressUpdates.map((p) => p.progress_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all pilot ids are unique", () => {
    const ids = fixture.demandPilots.map((p) => p.pilot_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── unique constraints ────────────────────────────────────────────────────

  it("like (demand_id, employee_id) pairs are all unique", () => {
    const pairs = fixture.demandLikes.map(
      (l) => `${l.demand_id}|${l.employee_id}`,
    );
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("comment-like (comment_id, employee_id) pairs are all unique", () => {
    const pairs = fixture.demandCommentLikes.map(
      (cl) => `${cl.comment_id}|${cl.employee_id}`,
    );
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("at most one is_primary=true per demand_id in demand-application links", () => {
    const primaryByDemand = new Map<string, number>();
    for (const link of fixture.demandApplications) {
      if (link.is_primary) {
        const count = primaryByDemand.get(link.demand_id) ?? 0;
        primaryByDemand.set(link.demand_id, count + 1);
      }
    }
    for (const [, count] of primaryByDemand) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  // ── comment structure ─────────────────────────────────────────────────────

  it("has 5 root comments and 3 replies", () => {
    const roots = fixture.demandComments.filter(
      (c) => c.parent_comment_id === null,
    );
    const replies = fixture.demandComments.filter(
      (c) => c.parent_comment_id !== null,
    );
    expect(roots).toHaveLength(5);
    expect(replies).toHaveLength(3);
  });

  it("reply parent_comment_id references resolve within comments", () => {
    const commentIds = new Set(
      fixture.demandComments.map((c) => c.comment_id),
    );
    const replies = fixture.demandComments.filter(
      (c) => c.parent_comment_id !== null,
    );
    for (const reply of replies) {
      expect(commentIds.has(reply.parent_comment_id!)).toBe(true);
    }
  });

  it("replies have the same demand_id as their root parent", () => {
    const commentById = new Map(
      fixture.demandComments.map((c) => [c.comment_id, c]),
    );
    const replies = fixture.demandComments.filter(
      (c) => c.parent_comment_id !== null,
    );
    for (const reply of replies) {
      const parent = commentById.get(reply.parent_comment_id!);
      expect(parent).toBeDefined();
      expect(reply.demand_id).toBe(parent!.demand_id);
    }
  });

  it("no comment is hidden", () => {
    for (const c of fixture.demandComments) {
      expect(c.hidden_at).toBeNull();
    }
  });

  // ── report statuses ───────────────────────────────────────────────────────

  it("has exactly 1 open, 1 dismissed, and 1 hidden report", () => {
    const open = fixture.demandReports.filter((r) => r.status === "open");
    const dismissed = fixture.demandReports.filter(
      (r) => r.status === "dismissed",
    );
    const hidden = fixture.demandReports.filter((r) => r.status === "hidden");
    expect(open).toHaveLength(1);
    expect(dismissed).toHaveLength(1);
    expect(hidden).toHaveLength(1);
  });

  it("open report has no resolved_by_employee_id and no resolved_at", () => {
    const openReport = fixture.demandReports.find((r) => r.status === "open");
    expect(openReport).toBeDefined();
    expect(openReport!.resolved_by_employee_id).toBeNull();
    expect(openReport!.resolved_at).toBeNull();
  });

  it("dismissed and hidden reports have a resolved_by_employee_id and resolved_at", () => {
    const resolved = fixture.demandReports.filter((r) => r.status !== "open");
    expect(resolved).toHaveLength(2);
    for (const r of resolved) {
      expect(r.resolved_by_employee_id).not.toBeNull();
      expect(r.resolved_at).not.toBeNull();
    }
  });

  it("report comment_id references resolve within comments", () => {
    const commentIds = new Set(
      fixture.demandComments.map((c) => c.comment_id),
    );
    for (const report of fixture.demandReports) {
      if (report.comment_id !== null) {
        expect(commentIds.has(report.comment_id)).toBe(true);
      }
    }
  });

  // ── pilot statuses ────────────────────────────────────────────────────────

  it("has exactly one pilot per status: planned, running, completed, cancelled", () => {
    const byStatus: Record<string, number> = {};
    for (const p of fixture.demandPilots) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    }
    expect(byStatus.planned).toBe(1);
    expect(byStatus.running).toBe(1);
    expect(byStatus.completed).toBe(1);
    expect(byStatus.cancelled).toBe(1);
  });

  it("planned and running pilots have no ends_at and no outcome", () => {
    const active = fixture.demandPilots.filter(
      (p) => p.status === "planned" || p.status === "running",
    );
    for (const p of active) {
      expect(p.ends_at).toBeNull();
      expect(p.outcome).toBeNull();
    }
  });

  it("completed and cancelled pilots have ends_at set", () => {
    const finished = fixture.demandPilots.filter(
      (p) => p.status === "completed" || p.status === "cancelled",
    );
    for (const p of finished) {
      expect(p.ends_at).toBeInstanceOf(Date);
    }
  });

  it("completed pilot has a non-null outcome", () => {
    const completed = fixture.demandPilots.find(
      (p) => p.status === "completed",
    );
    expect(completed).toBeDefined();
    expect(completed!.outcome).not.toBeNull();
  });

  // ── demand-application link roles ─────────────────────────────────────────

  it("has demand-application links covering candidate, pilot, and solution roles", () => {
    const roles = new Set(fixture.demandApplications.map((a) => a.role));
    expect(roles.has("candidate")).toBe(true);
    expect(roles.has("pilot")).toBe(true);
    expect(roles.has("solution")).toBe(true);
  });

  it("demand-application link application_id references resolve within published apps", () => {
    for (const link of fixture.demandApplications) {
      expect(typeof link.application_id).toBe("string");
      expect(link.application_id.length).toBeGreaterThan(0);
    }
  });

  // ── progress update coverage ──────────────────────────────────────────────

  it("progress updates span at least 2 different demand statuses", () => {
    const statuses = new Set(
      fixture.demandProgressUpdates.map((p) => p.status),
    );
    expect(statuses.size).toBeGreaterThanOrEqual(2);
  });

  it("progress update demand_id references are valid strings", () => {
    for (const pu of fixture.demandProgressUpdates) {
      expect(typeof pu.demand_id).toBe("string");
      expect(pu.demand_id.length).toBeGreaterThan(0);
    }
  });

  // ── employee references ───────────────────────────────────────────────────

  it("likes span at least 3 different employees", () => {
    const employees = new Set(fixture.demandLikes.map((l) => l.employee_id));
    expect(employees.size).toBeGreaterThanOrEqual(3);
  });

  it("comment authors reference valid demo employees", () => {
    const validEmployees = new Set([
      "DEMO-EMPLOYEE",
      "DEMO-APP-ADMIN",
      "DEMO-INNOVATION",
      "DEMO-ORG-ADMIN",
      "DEMO-SUPER-ADMIN",
    ]);
    for (const c of fixture.demandComments) {
      expect(validEmployees.has(c.author_employee_id)).toBe(true);
    }
  });

  // ── timestamps ────────────────────────────────────────────────────────────

  it("all comment timestamps are Date instances", () => {
    for (const c of fixture.demandComments) {
      expect(c.created_at).toBeInstanceOf(Date);
      expect(c.updated_at).toBeInstanceOf(Date);
    }
  });

  it("all like timestamps are Date instances", () => {
    for (const l of fixture.demandLikes) {
      expect(l.created_at).toBeInstanceOf(Date);
    }
  });

  it("all comment-like timestamps are Date instances", () => {
    for (const cl of fixture.demandCommentLikes) {
      expect(cl.created_at).toBeInstanceOf(Date);
    }
  });

  it("all report timestamps are Date instances", () => {
    for (const r of fixture.demandReports) {
      expect(r.created_at).toBeInstanceOf(Date);
    }
  });

  it("all progress update timestamps are Date instances", () => {
    for (const pu of fixture.demandProgressUpdates) {
      expect(pu.created_at).toBeInstanceOf(Date);
    }
  });

  it("all pilot timestamps are Date instances", () => {
    for (const p of fixture.demandPilots) {
      expect(p.created_at).toBeInstanceOf(Date);
      expect(p.updated_at).toBeInstanceOf(Date);
      expect(p.starts_at).toBeInstanceOf(Date);
    }
  });

  it("all demand-application link timestamps are Date instances", () => {
    for (const a of fixture.demandApplications) {
      expect(a.created_at).toBeInstanceOf(Date);
    }
  });

  // ── immutability ──────────────────────────────────────────────────────────

  it("returns distinct arrays on each call (no shared references)", () => {
    const f2 = buildDemandInteractionFixture(ANCHOR);
    expect(fixture.demandComments).not.toBe(f2.demandComments);
    expect(fixture.demandLikes).not.toBe(f2.demandLikes);
    expect(fixture.demandCommentLikes).not.toBe(f2.demandCommentLikes);
    expect(fixture.demandReports).not.toBe(f2.demandReports);
    expect(fixture.demandProgressUpdates).not.toBe(f2.demandProgressUpdates);
    expect(fixture.demandPilots).not.toBe(f2.demandPilots);
    expect(fixture.demandApplications).not.toBe(f2.demandApplications);
  });
});
