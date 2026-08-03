import { describe, expect, it } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import { AnalyticsEventService } from "./analytics.service.js";
import type {
  AnalyticsEventRepository,
  PersistedBehaviorEvent,
} from "./analytics.types.js";

const actor: ActorContext = {
  employeeId: "employee-1",
  roleCodes: ["employee"],
  departmentIds: ["department-1"],
  primaryDepartmentId: "department-1",
  sessionId: "session-1",
};

describe("AnalyticsEventService", () => {
  it("records a validated event, 180-day expiry, audit, and outbox in one boundary", async () => {
    const calls: string[] = [];
    let event: PersistedBehaviorEvent | undefined;
    const repository: AnalyticsEventRepository = {
      withTransaction: async (operation) => operation(repository),
      recordBehaviorEvent: async (value) => {
        event = value;
        calls.push("event");
        return true;
      },
      recordAuditEvent: async (value) => {
        expect(value.action).toBe("analytics.behavior_event.recorded");
        calls.push("audit");
      },
      appendOutboxEvent: async (value) => {
        expect(value.eventType).toBe("analytics.behavior_event.recorded");
        calls.push("outbox");
        return true;
      },
    };

    const result = await new AnalyticsEventService(repository).record(actor, {
      eventName: "demand_viewed",
      aggregateType: "demand",
      aggregateId: "demand-1",
      occurredAt: "2026-08-03T12:00:00.000Z",
      idempotencyKey: "event-1",
      metadata: { surface: "innovation-square" },
    });

    expect(result).toEqual({ inserted: true });
    expect(calls).toEqual(["event", "audit", "outbox"]);
    expect(event).toBeDefined();
    const recordedEvent = event;
    expect(recordedEvent?.actorEmployeeId).toBe("employee-1");
    expect(
      recordedEvent!.expiresAt.getTime() - recordedEvent!.occurredAt.getTime(),
    ).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it("does not create duplicate audit or outbox records for an idempotent replay", async () => {
    let auditCount = 0;
    const repository: AnalyticsEventRepository = {
      withTransaction: async (operation) => operation(repository),
      recordBehaviorEvent: async () => false,
      recordAuditEvent: async () => {
        auditCount += 1;
      },
      appendOutboxEvent: async () => {
        throw new Error("OUTBOX_SHOULD_NOT_BE_CALLED");
      },
    };

    await expect(
      new AnalyticsEventService(repository).record(actor, {
        eventName: "demand_viewed",
        aggregateType: "demand",
        aggregateId: "demand-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        idempotencyKey: "event-1",
        metadata: {},
      }),
    ).resolves.toEqual({ inserted: false });
    expect(auditCount).toBe(0);
  });
});
