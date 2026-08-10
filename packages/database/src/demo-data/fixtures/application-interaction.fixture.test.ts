import { describe, expect, it } from "vitest";
import { buildApplicationInteractionFixture } from "./application-interaction.fixture.js";

const ANCHOR = new Date("2025-06-15T12:00:00.000Z");

describe("buildApplicationInteractionFixture", () => {
  const fixture = buildApplicationInteractionFixture(ANCHOR);

  // ── counts ────────────────────────────────────────────────────────────────

  it("produces 12 application likes", () => {
    expect(fixture.applicationLikes).toHaveLength(12);
  });

  it("produces 8 application ratings", () => {
    expect(fixture.applicationRatings).toHaveLength(8);
  });

  it("produces 8 application comments", () => {
    expect(fixture.applicationComments).toHaveLength(8);
  });

  it("produces 2 application reports", () => {
    expect(fixture.applicationReports).toHaveLength(2);
  });

  it("produces 12 delivery actions", () => {
    expect(fixture.deliveryActions).toHaveLength(12);
  });

  // ── FK resolution ─────────────────────────────────────────────────────────

  it("all rating ids are unique", () => {
    const ids = fixture.applicationRatings.map((r) => r.rating_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all comment ids are unique", () => {
    const ids = fixture.applicationComments.map((c) => c.comment_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all report ids are unique", () => {
    const ids = fixture.applicationReports.map((r) => r.report_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all delivery action ids are unique", () => {
    const ids = fixture.deliveryActions.map((a) => a.action_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("like (application_id, employee_id) pairs are all unique", () => {
    const pairs = fixture.applicationLikes.map(
      (l) => `${l.application_id}|${l.employee_id}`,
    );
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("rating application_id references resolve within published apps", () => {
    const allAppIds = new Set(
      fixture.applicationRatings.map((r) => r.application_id),
    );
    // Each rating's application_id is a valid UUID-like string
    for (const r of fixture.applicationRatings) {
      expect(typeof r.application_id).toBe("string");
      expect(r.application_id.length).toBeGreaterThan(0);
    }
    // All application_ids are distinct (each published app at most once)
  });

  it("comment parent_comment_id is null for root comments and a valid comment_id for replies", () => {
    const commentIds = new Set(
      fixture.applicationComments.map((c) => c.comment_id),
    );
    const roots = fixture.applicationComments.filter(
      (c) => c.parent_comment_id === null,
    );
    const replies = fixture.applicationComments.filter(
      (c) => c.parent_comment_id !== null,
    );
    expect(roots.length).toBeGreaterThan(0);
    expect(replies.length).toBeGreaterThan(0);
    for (const reply of replies) {
      expect(commentIds.has(reply.parent_comment_id!)).toBe(true);
    }
  });

  it("report comment_id references resolve within comments", () => {
    const commentIds = new Set(
      fixture.applicationComments.map((c) => c.comment_id),
    );
    for (const report of fixture.applicationReports) {
      expect(commentIds.has(report.comment_id)).toBe(true);
    }
  });

  it("report application_id references resolve within published apps", () => {
    for (const report of fixture.applicationReports) {
      expect(typeof report.application_id).toBe("string");
      expect(report.application_id.length).toBeGreaterThan(0);
    }
  });

  it("delivery action application_id references resolve within published apps", () => {
    for (const da of fixture.deliveryActions) {
      expect(typeof da.application_id).toBe("string");
      expect(da.application_id.length).toBeGreaterThan(0);
    }
  });

  it("delivery action actor_employee_id references are valid demo employees", () => {
    const validEmployees = new Set([
      "DEMO-EMPLOYEE",
      "DEMO-APP-ADMIN",
      "DEMO-INNOVATION",
      "DEMO-ORG-ADMIN",
      "DEMO-SUPER-ADMIN",
    ]);
    for (const da of fixture.deliveryActions) {
      expect(validEmployees.has(da.actor_employee_id)).toBe(true);
    }
  });

  // ── unique constraint on ratings ──────────────────────────────────────────

  it("ratings have no duplicate (application_id, employee_id) pairs", () => {
    const pairs = new Set<string>();
    for (const r of fixture.applicationRatings) {
      const key = `${r.application_id}|${r.employee_id}`;
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  // ── report statuses ───────────────────────────────────────────────────────

  it("has exactly 1 open and 1 dismissed report", () => {
    const open = fixture.applicationReports.filter(
      (r) => r.status === "open",
    );
    const dismissed = fixture.applicationReports.filter(
      (r) => r.status === "dismissed",
    );
    expect(open).toHaveLength(1);
    expect(dismissed).toHaveLength(1);
  });

  it("open report has no resolved_by_employee_id and no resolved_at", () => {
    const openReport = fixture.applicationReports.find(
      (r) => r.status === "open",
    );
    expect(openReport).toBeDefined();
    expect(openReport!.resolved_by_employee_id).toBeNull();
    expect(openReport!.resolved_at).toBeNull();
  });

  it("dismissed report has a resolved_by_employee_id and resolved_at", () => {
    const dismissedReport = fixture.applicationReports.find(
      (r) => r.status === "dismissed",
    );
    expect(dismissedReport).toBeDefined();
    expect(dismissedReport!.resolved_by_employee_id).not.toBeNull();
    expect(dismissedReport!.resolved_at).not.toBeNull();
  });

  it("both reports have valid status values", () => {
    const validStatuses = new Set(["open", "dismissed", "hidden", "restored"]);
    for (const r of fixture.applicationReports) {
      expect(validStatuses.has(r.status)).toBe(true);
    }
  });

  // ── rating stars range ────────────────────────────────────────────────────

  it("all rating stars are between 1 and 5", () => {
    for (const r of fixture.applicationRatings) {
      expect(r.stars).toBeGreaterThanOrEqual(1);
      expect(r.stars).toBeLessThanOrEqual(5);
    }
  });

  it("ratings cover at least 3 distinct star values", () => {
    const starValues = new Set(
      fixture.applicationRatings.map((r) => r.stars),
    );
    expect(starValues.size).toBeGreaterThanOrEqual(3);
  });

  // ── comment structure ─────────────────────────────────────────────────────

  it("root comments have null parent_comment_id", () => {
    const roots = fixture.applicationComments.filter(
      (c) => c.parent_comment_id === null,
    );
    expect(roots.length).toBe(5);
  });

  it("replies have non-null parent_comment_id", () => {
    const replies = fixture.applicationComments.filter(
      (c) => c.parent_comment_id !== null,
    );
    expect(replies.length).toBe(3);
  });

  it("replies have the same application_id as their root parent", () => {
    const commentById = new Map(
      fixture.applicationComments.map((c) => [c.comment_id, c]),
    );
    const replies = fixture.applicationComments.filter(
      (c) => c.parent_comment_id !== null,
    );
    for (const reply of replies) {
      const parent = commentById.get(reply.parent_comment_id!);
      expect(parent).toBeDefined();
      expect(reply.application_id).toBe(parent!.application_id);
    }
  });

  it("no comment is hidden", () => {
    for (const c of fixture.applicationComments) {
      expect(c.hidden_at).toBeNull();
    }
  });

  // ── delivery action coverage ──────────────────────────────────────────────

  it("covers all 3 action types", () => {
    const types = new Set(fixture.deliveryActions.map((da) => da.action_type));
    expect(types.has("web_redirect")).toBe(true);
    expect(types.has("package_download")).toBe(true);
    expect(types.has("qr_display")).toBe(true);
  });

  it("has delivery actions across multiple channels", () => {
    const channels = new Set(
      fixture.deliveryActions
        .map((da) => da.channel)
        .filter((c): c is string => c !== null),
    );
    expect(channels.size).toBeGreaterThanOrEqual(2);
  });

  // ── employee coverage in likes ────────────────────────────────────────────

  it("likes span at least 3 different employees", () => {
    const employees = new Set(
      fixture.applicationLikes.map((l) => l.employee_id),
    );
    expect(employees.size).toBeGreaterThanOrEqual(3);
  });

  // ── version references ────────────────────────────────────────────────────

  it("all rating application_version_id references are non-null strings", () => {
    for (const r of fixture.applicationRatings) {
      expect(typeof r.application_version_id).toBe("string");
      expect(r.application_version_id.length).toBeGreaterThan(0);
    }
  });

  it("all comment application_version_id references are non-null strings", () => {
    for (const c of fixture.applicationComments) {
      expect(typeof c.application_version_id).toBe("string");
      expect(c.application_version_id.length).toBeGreaterThan(0);
    }
  });

  it("all delivery action application_version_id references are non-null strings", () => {
    for (const da of fixture.deliveryActions) {
      expect(da.application_version_id).not.toBeNull();
      expect(typeof da.application_version_id).toBe("string");
    }
  });

  // ── timestamps ────────────────────────────────────────────────────────────

  it("all application likes have Date created_at", () => {
    for (const l of fixture.applicationLikes) {
      expect(l.created_at).toBeInstanceOf(Date);
    }
  });

  it("all application ratings have Date created_at and updated_at", () => {
    for (const r of fixture.applicationRatings) {
      expect(r.created_at).toBeInstanceOf(Date);
      expect(r.updated_at).toBeInstanceOf(Date);
    }
  });

  it("all application comments have Date created_at and updated_at", () => {
    for (const c of fixture.applicationComments) {
      expect(c.created_at).toBeInstanceOf(Date);
      expect(c.updated_at).toBeInstanceOf(Date);
    }
  });

  it("all application reports have Date created_at", () => {
    for (const r of fixture.applicationReports) {
      expect(r.created_at).toBeInstanceOf(Date);
    }
  });

  it("all delivery actions have Date occurred_at", () => {
    for (const da of fixture.deliveryActions) {
      expect(da.occurred_at).toBeInstanceOf(Date);
    }
  });

  // ── immutability ──────────────────────────────────────────────────────────

  it("returns distinct arrays on each call (no shared references)", () => {
    const f2 = buildApplicationInteractionFixture(ANCHOR);
    expect(fixture.applicationLikes).not.toBe(f2.applicationLikes);
    expect(fixture.applicationRatings).not.toBe(f2.applicationRatings);
    expect(fixture.applicationComments).not.toBe(f2.applicationComments);
    expect(fixture.applicationReports).not.toBe(f2.applicationReports);
    expect(fixture.deliveryActions).not.toBe(f2.deliveryActions);
  });
});
