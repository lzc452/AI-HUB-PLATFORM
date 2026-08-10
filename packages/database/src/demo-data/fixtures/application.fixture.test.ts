import { describe, expect, it } from "vitest";
import { buildApplicationFixture } from "./application.fixture.js";
import type {
  ApplicationsTable,
  ApplicationVersionsTable,
  ApplicationDeliveriesTable,
  ApplicationReviewsTable,
  ApplicationReviewQueueTable,
  ApplicationAuditEventsTable,
} from "../../schema.js";

const ANCHOR = new Date("2025-06-15T12:00:00.000Z");

describe("buildApplicationFixture", () => {
  const fixture = buildApplicationFixture(ANCHOR);

  // ── counts ────────────────────────────────────────────────────────────────

  it("produces 20 applications", () => {
    expect(fixture.applications).toHaveLength(20);
  });

  it("produces 20 application versions", () => {
    expect(fixture.applicationVersions).toHaveLength(20);
  });

  it("produces 44 application deliveries", () => {
    expect(fixture.applicationDeliveries).toHaveLength(44);
  });

  it("produces 5 application reviews", () => {
    expect(fixture.applicationReviews).toHaveLength(5);
  });

  it("produces 5 application review queue entries", () => {
    expect(fixture.applicationReviewQueue).toHaveLength(5);
  });

  it("produces 10 application audit events", () => {
    expect(fixture.applicationAuditEvents).toHaveLength(10);
  });

  // ── status distribution ────────────────────────────────────────────────────

  it("has exactly 3 draft applications", () => {
    const count = fixture.applications.filter(
      (a) => a.status === "draft",
    ).length;
    expect(count).toBe(3);
  });

  it("has exactly 3 in_review applications", () => {
    const count = fixture.applications.filter(
      (a) => a.status === "in_review",
    ).length;
    expect(count).toBe(3);
  });

  it("has exactly 1 approved application", () => {
    const count = fixture.applications.filter(
      (a) => a.status === "approved",
    ).length;
    expect(count).toBe(1);
  });

  it("has exactly 10 published applications", () => {
    const count = fixture.applications.filter(
      (a) => a.status === "published",
    ).length;
    expect(count).toBe(10);
  });

  it("has exactly 2 withdrawn applications", () => {
    const count = fixture.applications.filter(
      (a) => a.status === "withdrawn",
    ).length;
    expect(count).toBe(2);
  });

  it("has exactly 1 archived application", () => {
    const count = fixture.applications.filter(
      (a) => a.status === "archived",
    ).length;
    expect(count).toBe(1);
  });

  // ── FK resolution ──────────────────────────────────────────────────────────

  it("all application ids are unique", () => {
    const ids = fixture.applications.map((a) => a.application_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all version ids are unique", () => {
    const ids = fixture.applicationVersions.map((v) => v.application_version_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all delivery ids are unique", () => {
    const ids = fixture.applicationDeliveries.map((d) => d.delivery_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all review ids are unique", () => {
    const ids = fixture.applicationReviews.map((r) => r.review_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all review queue ids are unique", () => {
    const ids = fixture.applicationReviewQueue.map((q) => q.review_queue_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all audit event ids are unique", () => {
    const ids = fixture.applicationAuditEvents.map((e) => e.audit_event_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("version application_id references resolve within applications", () => {
    const appIds = new Set(fixture.applications.map((a) => a.application_id));
    for (const v of fixture.applicationVersions) {
      expect(appIds.has(v.application_id)).toBe(true);
    }
  });

  it("delivery application_id references resolve within applications", () => {
    const appIds = new Set(fixture.applications.map((a) => a.application_id));
    for (const d of fixture.applicationDeliveries) {
      expect(appIds.has(d.application_id)).toBe(true);
    }
  });

  it("review application_id references resolve within applications", () => {
    const appIds = new Set(fixture.applications.map((a) => a.application_id));
    for (const r of fixture.applicationReviews) {
      expect(appIds.has(r.application_id)).toBe(true);
    }
  });

  it("review application_version_id references resolve within versions", () => {
    const versionIds = new Set(
      fixture.applicationVersions.map((v) => v.application_version_id),
    );
    for (const r of fixture.applicationReviews) {
      expect(versionIds.has(r.application_version_id)).toBe(true);
    }
  });

  it("review queue application_id references resolve within applications", () => {
    const appIds = new Set(fixture.applications.map((a) => a.application_id));
    for (const q of fixture.applicationReviewQueue) {
      expect(appIds.has(q.application_id)).toBe(true);
    }
  });

  it("review queue application_version_id references resolve within versions", () => {
    const versionIds = new Set(
      fixture.applicationVersions.map((v) => v.application_version_id),
    );
    for (const q of fixture.applicationReviewQueue) {
      expect(versionIds.has(q.application_version_id)).toBe(true);
    }
  });

  it("audit event application_id references resolve within applications", () => {
    const appIds = new Set(fixture.applications.map((a) => a.application_id));
    for (const ev of fixture.applicationAuditEvents) {
      expect(appIds.has(ev.application_id)).toBe(true);
    }
  });

  it("audit event application_version_id references null or resolves within versions", () => {
    const versionIds = new Set(
      fixture.applicationVersions.map((v) => v.application_version_id),
    );
    for (const ev of fixture.applicationAuditEvents) {
      if (ev.application_version_id !== null) {
        expect(versionIds.has(ev.application_version_id)).toBe(true);
      }
    }
  });

  // ── delivery channels ───────────────────────────────────────────────────────

  it("has all 4 delivery channels represented", () => {
    const channels = new Set(
      fixture.applicationDeliveries.map((d) => d.channel),
    );
    expect(channels.has("web")).toBe(true);
    expect(channels.has("desktop")).toBe(true);
    expect(channels.has("mobile")).toBe(true);
    expect(channels.has("mini_program")).toBe(true);
  });

  it("has at least 4 published apps with all 4 channels", () => {
    // Get published app IDs
    const publishedIds = new Set(
      fixture.applications
        .filter((a) => a.status === "published")
        .map((a) => a.application_id),
    );
    // For each published app, count its distinct channels
    let fullCoverageCount = 0;
    for (const appId of publishedIds) {
      const channels = new Set(
        fixture.applicationDeliveries
          .filter((d) => d.application_id === appId)
          .map((d) => d.channel),
      );
      if (channels.size === 4) fullCoverageCount++;
    }
    expect(fullCoverageCount).toBeGreaterThanOrEqual(4);
  });

  // ── data integrity ─────────────────────────────────────────────────────────

  it("all draft apps have no delivery", () => {
    const draftIds = new Set(
      fixture.applications
        .filter((a) => a.status === "draft")
        .map((a) => a.application_id),
    );
    const draftDeliveries = fixture.applicationDeliveries.filter((d) =>
      draftIds.has(d.application_id),
    );
    expect(draftDeliveries).toHaveLength(0);
  });

  it("all reviews have valid decisions", () => {
    const validDecisions = new Set(["approve", "reject", "request_changes"]);
    for (const r of fixture.applicationReviews) {
      expect(validDecisions.has(r.decision)).toBe(true);
    }
  });

  it("all review queue entries have valid status", () => {
    const validStatuses = new Set(["available", "claimed"]);
    for (const q of fixture.applicationReviewQueue) {
      expect(validStatuses.has(q.status)).toBe(true);
    }
  });

  it("claimed queue entries have a claimed_by_employee_id", () => {
    const claimedEntries = fixture.applicationReviewQueue.filter(
      (q) => q.status === "claimed",
    );
    for (const q of claimedEntries) {
      expect(q.claimed_by_employee_id).not.toBeNull();
      expect(q.claimed_at).not.toBeNull();
    }
  });

  it("available queue entries have no claimed_by", () => {
    const availableEntries = fixture.applicationReviewQueue.filter(
      (q) => q.status === "available",
    );
    for (const q of availableEntries) {
      expect(q.claimed_by_employee_id).toBeNull();
      expect(q.claimed_at).toBeNull();
    }
  });

  it("all versions have valid scan_status values", () => {
    const valid = new Set(["pending", "passed", "failed"]);
    for (const v of fixture.applicationVersions) {
      expect(valid.has(v.scan_status)).toBe(true);
    }
  });

  it("has some deliveries with enabled=false for variety", () => {
    const disabled = fixture.applicationDeliveries.filter(
      (d) => d.enabled === false,
    );
    expect(disabled.length).toBeGreaterThan(0);
  });

  it("has some versions with scan_status=pending", () => {
    const pending = fixture.applicationVersions.filter(
      (v) => v.scan_status === "pending",
    );
    expect(pending.length).toBeGreaterThan(0);
  });

  it("has some versions with scan_status=passed", () => {
    const passed = fixture.applicationVersions.filter(
      (v) => v.scan_status === "passed",
    );
    expect(passed.length).toBeGreaterThan(0);
  });

  // ── timestamps ──────────────────────────────────────────────────────────────

  it("all created_at fields are Date instances", () => {
    for (const a of fixture.applications) {
      expect(a.created_at).toBeInstanceOf(Date);
    }
    for (const v of fixture.applicationVersions) {
      expect(v.created_at).toBeInstanceOf(Date);
    }
    for (const d of fixture.applicationDeliveries) {
      expect(d.created_at).toBeInstanceOf(Date);
    }
    for (const r of fixture.applicationReviews) {
      expect(r.created_at).toBeInstanceOf(Date);
    }
    for (const q of fixture.applicationReviewQueue) {
      expect(q.created_at).toBeInstanceOf(Date);
    }
    for (const ev of fixture.applicationAuditEvents) {
      expect(ev.created_at).toBeInstanceOf(Date);
    }
  });

  // ── immutability ────────────────────────────────────────────────────────────

  it("returns distinct arrays on each call (no shared references)", () => {
    const f2 = buildApplicationFixture(ANCHOR);
    expect(fixture.applications).not.toBe(f2.applications);
    expect(fixture.applicationVersions).not.toBe(f2.applicationVersions);
    expect(fixture.applicationDeliveries).not.toBe(f2.applicationDeliveries);
    expect(fixture.applicationReviews).not.toBe(f2.applicationReviews);
    expect(fixture.applicationReviewQueue).not.toBe(f2.applicationReviewQueue);
    expect(fixture.applicationAuditEvents).not.toBe(f2.applicationAuditEvents);
  });
});
