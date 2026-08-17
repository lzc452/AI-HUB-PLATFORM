import { describe, expect, it } from "vitest";
import { buildAnalyticsFixture } from "./analytics.fixture.js";

describe("buildAnalyticsFixture", () => {
  const anchor = new Date("2026-08-01T00:00:00Z");
  const fixture = buildAnalyticsFixture(anchor);

  // ── counts ─────────────────────────────────────────────────────────────────

  it("produces 40 behavior events", () => {
    expect(fixture.behaviorEvents).toHaveLength(40);
  });

  it("produces 1800 daily aggregates (30 days × 20 metrics × 3 scopes)", () => {
    expect(fixture.dailyAggregates).toHaveLength(1800);
  });

  it("produces 3 export jobs", () => {
    expect(fixture.exportJobs).toHaveLength(3);
  });

  it("produces 6 analytics audit events", () => {
    expect(fixture.auditEvents).toHaveLength(6);
  });

  it("produces 6 outbox events", () => {
    expect(fixture.outboxEvents).toHaveLength(6);
  });

  // ── behavior events ────────────────────────────────────────────────────────

  it("has exactly 2 events per behavior event type", () => {
    const counts = new Map<string, number>();
    for (const e of fixture.behaviorEvents) {
      counts.set(e.event_name, (counts.get(e.event_name) ?? 0) + 1);
    }
    expect(counts.size).toBe(20);
    for (const count of counts.values()) {
      expect(count).toBe(2);
    }
  });

  it("behavior event IDs are unique", () => {
    const ids = fixture.behaviorEvents.map((e) => e.event_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("behavior event idempotency keys are unique and start with demo:analytics:behavior:", () => {
    const keys = fixture.behaviorEvents.map((e) => e.idempotency_key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^demo:analytics:behavior:\d+$/);
    }
  });

  it("behavior event timestamps are Date instances", () => {
    for (const e of fixture.behaviorEvents) {
      expect(e.occurred_at).toBeInstanceOf(Date);
      expect(e.expires_at).toBeInstanceOf(Date);
      expect(e.created_at).toBeInstanceOf(Date);
    }
  });

  it("behavior event expires_at is 180 days after occurred_at", () => {
    for (const e of fixture.behaviorEvents) {
      const delta = e.expires_at.getTime() - e.occurred_at.getTime();
      expect(delta).toBe(180 * 24 * 60 * 60 * 1000);
    }
  });

  it("behavior events have valid employee references", () => {
    const validEmps = new Set([
      "DEMO-EMPLOYEE",
      "DEMO-APP-ADMIN",
      "DEMO-INNOVATION",
      "DEMO-ORG-ADMIN",
      "DEMO-SUPER-ADMIN",
    ]);
    for (const e of fixture.behaviorEvents) {
      expect(validEmps.has(e.actor_employee_id!)).toBe(true);
    }
  });

  it("behavior events include both scoped and unscoped audience", () => {
    const withDept = fixture.behaviorEvents.filter(
      (e) => e.audience_department_id !== null,
    );
    const withEmp = fixture.behaviorEvents.filter(
      (e) => e.audience_employee_id !== null,
    );
    expect(withDept.length).toBeGreaterThan(0);
    expect(withEmp.length).toBeGreaterThan(0);
    expect(withEmp.length).toBeLessThan(40); // some have null employee audience
  });

  // ── daily aggregates ───────────────────────────────────────────────────────

  it("daily aggregates have unique composite keys", () => {
    const keys = new Set<string>();
    for (const a of fixture.dailyAggregates) {
      const key = `${a.metric_key}|${a.metric_version}|${a.day}|${a.audience_scope_key}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it("daily aggregates span all 30 days, 20 metrics, and 3 scopes", () => {
    const days = new Set<string>();
    const metrics = new Set<string>();
    const scopes = new Set<string>();
    for (const a of fixture.dailyAggregates) {
      days.add(a.day);
      metrics.add(a.metric_key);
      scopes.add(a.audience_scope_key);
    }
    expect(days.size).toBe(30);
    expect(metrics.size).toBe(20);
    expect(scopes.size).toBe(3);
  });

  it("daily aggregate values are numbers >= 0", () => {
    for (const a of fixture.dailyAggregates) {
      expect(typeof a.value).toBe("number");
      expect(a.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("daily aggregate source_event_count is positive", () => {
    for (const a of fixture.dailyAggregates) {
      expect(a.source_event_count).toBeGreaterThan(0);
    }
  });

  it("daily aggregate computed_at is a Date", () => {
    for (const a of fixture.dailyAggregates) {
      expect(a.computed_at).toBeInstanceOf(Date);
    }
  });

  // ── export jobs ────────────────────────────────────────────────────────────

  it("export jobs have all required statuses", () => {
    const statuses = new Set(fixture.exportJobs.map((j) => j.status));
    expect(statuses.has("completed")).toBe(true);
    expect(statuses.has("queued")).toBe(true);
    expect(statuses.has("failed")).toBe(true);
  });

  it("completed export job has completed_at set and no failure_code", () => {
    const completed = fixture.exportJobs.find((j) => j.status === "completed")!;
    expect(completed.completed_at).toBeInstanceOf(Date);
    expect(completed.failure_code).toBeNull();
  });

  it("queued export job has null completed_at", () => {
    const queued = fixture.exportJobs.find((j) => j.status === "queued")!;
    expect(queued.completed_at).toBeNull();
  });

  it("failed export job has failure_code", () => {
    const failed = fixture.exportJobs.find((j) => j.status === "failed")!;
    expect(failed.failure_code).not.toBeNull();
  });

  // ── audit events ───────────────────────────────────────────────────────────

  it("audit event IDs are unique", () => {
    const ids = fixture.auditEvents.map((e) => e.audit_event_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("audit events have valid action types", () => {
    const actions = new Set(fixture.auditEvents.map((e) => e.action));
    expect(actions.has("export.created")).toBe(true);
    expect(actions.has("export.completed")).toBe(true);
    expect(actions.has("export.failed")).toBe(true);
    expect(actions.has("dashboard.viewed")).toBe(true);
  });

  // ── outbox events ──────────────────────────────────────────────────────────

  it("outbox event IDs are unique", () => {
    const ids = fixture.outboxEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("outbox event idempotency keys are unique", () => {
    const keys = fixture.outboxEvents.map((e) => e.idempotency_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("outbox events cover all statuses", () => {
    const statuses = new Set(fixture.outboxEvents.map((e) => e.status));
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.has("processing")).toBe(true);
    expect(statuses.has("completed")).toBe(true);
    expect(statuses.has("failed")).toBe(true);
  });

  it("completed outbox event has completed_at", () => {
    const completed = fixture.outboxEvents.find(
      (e) => e.status === "completed",
    )!;
    expect(completed.completed_at).toBeInstanceOf(Date);
  });

  it("failed outbox events have last_error set", () => {
    const failed = fixture.outboxEvents.filter((e) => e.status === "failed");
    for (const e of failed) {
      expect(e.last_error).not.toBeNull();
    }
  });

  it("pending outbox events have no claimed_by", () => {
    const pending = fixture.outboxEvents.filter((e) => e.status === "pending");
    for (const e of pending) {
      expect(e.claimed_by).toBeNull();
      expect(e.claimed_at).toBeNull();
    }
  });

  // ── immutability ───────────────────────────────────────────────────────────

  it("returns distinct arrays on each call (immutability)", () => {
    const f1 = buildAnalyticsFixture(anchor);
    const f2 = buildAnalyticsFixture(anchor);
    expect(f1.behaviorEvents).not.toBe(f2.behaviorEvents);
    expect(f1.dailyAggregates).not.toBe(f2.dailyAggregates);
    expect(f1.exportJobs).not.toBe(f2.exportJobs);
    expect(f1.auditEvents).not.toBe(f2.auditEvents);
    expect(f1.outboxEvents).not.toBe(f2.outboxEvents);
  });

  it("produces identical data for the same anchor date", () => {
    const f1 = buildAnalyticsFixture(anchor);
    const f2 = buildAnalyticsFixture(anchor);
    expect(f1.dailyAggregates[0]?.value).toBe(f2.dailyAggregates[0]?.value);
    expect(f1.dailyAggregates[1799]?.value).toBe(
      f2.dailyAggregates[1799]?.value,
    );
  });
});
