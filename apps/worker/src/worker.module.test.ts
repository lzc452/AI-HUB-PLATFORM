import { describe, expect, it } from "vitest";
import {
  outboxHandlers,
  systemProbeRequestedHandler,
} from "./worker.module.js";

describe("worker outbox handlers", () => {
  it("registers the infrastructure probe handler and it resolves", async () => {
    expect(Object.keys(outboxHandlers)).toEqual(["system.probe.requested"]);
    expect(outboxHandlers["system.probe.requested"]).toBe(
      systemProbeRequestedHandler,
    );

    await expect(
      systemProbeRequestedHandler({
        id: "event-1",
        eventType: "system.probe.requested",
        aggregateType: "system",
        aggregateId: "probe",
        payload: {},
        idempotencyKey: "probe-1",
        attempts: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
