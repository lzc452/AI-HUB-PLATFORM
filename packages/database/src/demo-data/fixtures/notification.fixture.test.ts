import { describe, expect, it } from "vitest";
import { buildNotificationFixture } from "./notification.fixture.js";

const ANCHOR = new Date("2025-06-15T12:00:00.000Z");

/** 20 个权威通知类型（与 DINGTALK_NOTIFICATION_MATRIX + 系统/互动类一致）。 */
const CANONICAL_EVENT_TYPES: readonly string[] = Object.freeze([
  "application.review_requested",
  "application.review_decided",
  "application.published",
  "application.withdrawn",
  "demand.submitted",
  "demand.claimed",
  "demand.collaborator_assigned",
  "demand.progress_updated",
  "demand.pilot_started",
  "demand.closed",
  "demand.merged",
  "analytics.export.completed",
  "analytics.export.failed",
  "analytics.assistant.failed",
  "system.announcement",
  "system.maintenance",
  "system.audit_alert",
  "application.comment_replied",
  "application.rating_added",
  "application.reported",
]);

const VALID_EMPLOYEES = new Set([
  "DEMO-EMPLOYEE",
  "DEMO-APP-ADMIN",
  "DEMO-INNOVATION",
  "DEMO-ORG-ADMIN",
  "DEMO-SUPER-ADMIN",
]);

describe("buildNotificationFixture", () => {
  const fixture = buildNotificationFixture(ANCHOR);

  // ── counts ────────────────────────────────────────────────────────────────

  it("produces 20 notifications", () => {
    expect(fixture.notifications).toHaveLength(20);
  });

  it("covers all 20 canonical event types exactly once", () => {
    const types = fixture.notifications.map((n) => n.event_type).sort();
    expect(types).toEqual([...CANONICAL_EVENT_TYPES].sort());
  });

  it("distributes notifications across all 5 demo employees", () => {
    const byEmployee = new Map<string, number>();
    for (const n of fixture.notifications) {
      byEmployee.set(
        n.recipient_employee_id,
        (byEmployee.get(n.recipient_employee_id) ?? 0) + 1,
      );
    }
    expect(byEmployee.size).toBe(5);
    for (const emp of VALID_EMPLOYEES) {
      expect(byEmployee.get(emp)).toBeGreaterThanOrEqual(1);
    }
  });

  // ── delivery status coverage ──────────────────────────────────────────────

  it("covers all 4 delivery statuses: pending, sent, retry, failed", () => {
    const statuses = new Set(fixture.notifications.map((n) => n.delivery_status));
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.has("sent")).toBe(true);
    expect(statuses.has("retry")).toBe(true);
    expect(statuses.has("failed")).toBe(true);
    expect(statuses.size).toBe(4);
  });

  it("has at least 2 notifications per delivery status", () => {
    const byStatus: Record<string, number> = {};
    for (const n of fixture.notifications) {
      byStatus[n.delivery_status] = (byStatus[n.delivery_status] ?? 0) + 1;
    }
    expect(byStatus.pending).toBeGreaterThanOrEqual(2);
    expect(byStatus.sent).toBeGreaterThanOrEqual(2);
    expect(byStatus.retry).toBeGreaterThanOrEqual(2);
    expect(byStatus.failed).toBeGreaterThanOrEqual(2);
  });

  // ── read/unread mix ───────────────────────────────────────────────────────

  it("has a mix of read and unread notifications", () => {
    const read = fixture.notifications.filter((n) => n.read_at !== null);
    const unread = fixture.notifications.filter((n) => n.read_at === null);
    expect(read.length).toBeGreaterThan(0);
    expect(unread.length).toBeGreaterThan(0);
    expect(read.length + unread.length).toBe(20);
  });

  it("unread notifications have null read_at", () => {
    const unread = fixture.notifications.filter((n) => n.read_at === null);
    for (const n of unread) {
      expect(n.read_at).toBeNull();
    }
  });

  it("read notifications have a Date instance for read_at", () => {
    const read = fixture.notifications.filter((n) => n.read_at !== null);
    for (const n of read) {
      expect(n.read_at).toBeInstanceOf(Date);
    }
  });

  // ── idempotency keys ──────────────────────────────────────────────────────

  it("all notifications have non-empty idempotency_key", () => {
    for (const n of fixture.notifications) {
      expect(typeof n.idempotency_key).toBe("string");
      expect(n.idempotency_key.length).toBeGreaterThan(0);
    }
  });

  it("all notifications have demo-scoped idempotency keys", () => {
    for (const n of fixture.notifications) {
      expect(n.idempotency_key).toMatch(/^demo:notification:/);
    }
  });

  it("all idempotency keys are unique", () => {
    const keys = fixture.notifications.map((n) => n.idempotency_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // ── delivery fields ───────────────────────────────────────────────────────

  it("pending/sent notifications have delivery_attempts: 0 or 1", () => {
    const pendingOrSent = fixture.notifications.filter(
      (n) => n.delivery_status === "pending" || n.delivery_status === "sent",
    );
    for (const n of pendingOrSent) {
      expect(n.delivery_attempts).toBeLessThanOrEqual(1);
    }
  });

  it("pending notifications have no last_delivery_error", () => {
    const pending = fixture.notifications.filter(
      (n) => n.delivery_status === "pending",
    );
    for (const n of pending) {
      expect(n.last_delivery_error).toBeNull();
    }
  });

  it("failed and retry notifications have a last_delivery_error", () => {
    const retryOrFailed = fixture.notifications.filter(
      (n) => n.delivery_status === "retry" || n.delivery_status === "failed",
    );
    for (const n of retryOrFailed) {
      expect(typeof n.last_delivery_error).toBe("string");
      expect(n.last_delivery_error!.length).toBeGreaterThan(0);
    }
  });

  it("failed and retry notifications have delivery_attempts >= 2", () => {
    const retryOrFailed = fixture.notifications.filter(
      (n) => n.delivery_status === "retry" || n.delivery_status === "failed",
    );
    for (const n of retryOrFailed) {
      expect(n.delivery_attempts).toBeGreaterThanOrEqual(2);
    }
  });

  it("retry notifications have a next_attempt_at set", () => {
    const retry = fixture.notifications.filter(
      (n) => n.delivery_status === "retry",
    );
    for (const n of retry) {
      expect(n.next_attempt_at).toBeInstanceOf(Date);
    }
  });

  it("non-retry notifications do not have next_attempt_at", () => {
    const nonRetry = fixture.notifications.filter(
      (n) => n.delivery_status !== "retry",
    );
    for (const n of nonRetry) {
      expect(n.next_attempt_at).toBeNull();
    }
  });

  // ── ids ───────────────────────────────────────────────────────────────────

  it("all notification_ids are unique", () => {
    const ids = fixture.notifications.map((n) => n.notification_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all notification_ids are valid UUID strings", () => {
    for (const n of fixture.notifications) {
      expect(typeof n.notification_id).toBe("string");
      expect(n.notification_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  // ── employee references ───────────────────────────────────────────────────

  it("all recipient_employee_ids reference the 5 demo employees", () => {
    for (const n of fixture.notifications) {
      expect(VALID_EMPLOYEES.has(n.recipient_employee_id)).toBe(true);
    }
  });

  // ── timestamps ────────────────────────────────────────────────────────────

  it("all created_at are Date instances", () => {
    for (const n of fixture.notifications) {
      expect(n.created_at).toBeInstanceOf(Date);
    }
  });

  it("read_at is always after or equal to created_at when present", () => {
    for (const n of fixture.notifications) {
      if (n.read_at != null) {
        expect(n.read_at.getTime()).toBeGreaterThanOrEqual(
          n.created_at!.getTime(),
        );
      }
    }
  });

  // ── content ───────────────────────────────────────────────────────────────

  it("all messages are non-empty strings", () => {
    for (const n of fixture.notifications) {
      expect(typeof n.message).toBe("string");
      expect(n.message.length).toBeGreaterThan(0);
    }
  });

  it("all event_types are non-empty strings", () => {
    for (const n of fixture.notifications) {
      expect(typeof n.event_type).toBe("string");
      expect(n.event_type.length).toBeGreaterThan(0);
    }
  });

  it("all aggregate_ids are non-empty strings", () => {
    for (const n of fixture.notifications) {
      expect(typeof n.aggregate_id).toBe("string");
      expect(n.aggregate_id.length).toBeGreaterThan(0);
    }
  });

  // ── immutability ──────────────────────────────────────────────────────────

  it("returns distinct arrays on each call (no shared references)", () => {
    const f2 = buildNotificationFixture(ANCHOR);
    expect(fixture.notifications).not.toBe(f2.notifications);
  });
});
