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

  it("exposes a retention runner for the worker schedule", async () => {
    const { createRetentionRunner } = await import("./worker.module.js");
    let calls = 0;
    const runner = createRetentionRunner({
      run: async () => {
        calls += 1;
        return { deleted: 2 };
      },
    });
    await expect(runner()).resolves.toEqual({ deleted: 2 });
    expect(calls).toBe(1);
  });
});
