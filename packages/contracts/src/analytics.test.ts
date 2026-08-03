import { describe, expect, it } from "vitest";
import { behaviorEventNames, validateBehaviorEventInput } from "./analytics.js";

describe("analytics behavior event contract", () => {
  it("accepts only the fixed event vocabulary and bounded metadata", () => {
    expect(behaviorEventNames).toContain("application_viewed");
    expect(behaviorEventNames).toContain("assistant_failed");
    expect(behaviorEventNames).toContain("notification_delivery_retried");
    expect(
      validateBehaviorEventInput({
        eventName: "demand_viewed",
        aggregateType: "demand",
        aggregateId: "demand-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        idempotencyKey: "evt-1",
        metadata: { surface: "innovation-square" },
      }),
    ).toEqual({ ok: true });
  });

  it("rejects unapproved event names and oversized metadata values", () => {
    expect(
      validateBehaviorEventInput({
        eventName: "employee_number_leaked",
        aggregateType: "assistant",
        aggregateId: "assistant-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        idempotencyKey: "evt-2",
        metadata: {},
      }),
    ).toEqual({ ok: false, reason: "EVENT_NAME_NOT_ALLOWED" });

    expect(
      validateBehaviorEventInput({
        eventName: "demand_viewed",
        aggregateType: "demand",
        aggregateId: "demand-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        idempotencyKey: "evt-3",
        metadata: { description: "x".repeat(513) },
      }),
    ).toEqual({ ok: false, reason: "METADATA_VALUE_TOO_LONG" });
  });
});
