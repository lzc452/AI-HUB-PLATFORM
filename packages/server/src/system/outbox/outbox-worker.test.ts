import { describe, expect, it, vi } from "vitest";
import { OutboxWorker } from "./outbox-worker.js";

describe("OutboxWorker", () => {
  it("completes a claimed event after its handler succeeds", async () => {
    const store = {
      claim: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          eventType: "system.probe.requested",
          aggregateType: "system",
          aggregateId: "probe",
          payload: {},
          idempotencyKey: "probe-1",
          attempts: 1,
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = new OutboxWorker(store, {
      "system.probe.requested": handler,
    });

    await expect(worker.runOnce("worker-a")).resolves.toBe(1);

    expect(handler).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith("event-1");
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("fails an event whose handler is missing", async () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    const store = {
      claim: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          eventType: "system.unknown",
          aggregateType: "system",
          aggregateId: "unknown",
          payload: {},
          idempotencyKey: "unknown-1",
          attempts: 1,
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorker(store, {}, () => now);

    await worker.runOnce("worker-a");

    expect(store.fail).toHaveBeenCalledWith(
      "event-1",
      "OUTBOX_HANDLER_MISSING",
      new Date("2026-07-31T00:00:01.000Z"),
    );
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("fails an event with a safe code when its handler throws", async () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    const store = {
      claim: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          eventType: "system.probe.requested",
          aggregateType: "system",
          aggregateId: "probe",
          payload: {},
          idempotencyKey: "probe-1",
          attempts: 1,
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorker(
      store,
      {
        "system.probe.requested": vi
          .fn()
          .mockRejectedValue(new Error("secret database password")),
      },
      () => now,
    );

    await worker.runOnce("worker-a");

    expect(store.fail).toHaveBeenCalledWith(
      "event-1",
      "OUTBOX_HANDLER_FAILED",
      new Date("2026-07-31T00:00:01.000Z"),
    );
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("continues processing a batch after a handler fails", async () => {
    const firstHandler = vi.fn().mockRejectedValue(new Error("failed"));
    const secondHandler = vi.fn().mockResolvedValue(undefined);
    const store = {
      claim: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          eventType: "system.first",
          aggregateType: "system",
          aggregateId: "first",
          payload: {},
          idempotencyKey: "first-1",
          attempts: 1,
        },
        {
          id: "event-2",
          eventType: "system.second",
          aggregateType: "system",
          aggregateId: "second",
          payload: {},
          idempotencyKey: "second-1",
          attempts: 1,
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorker(store, {
      "system.first": firstHandler,
      "system.second": secondHandler,
    });

    await worker.runOnce("worker-a");

    expect(secondHandler).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith("event-2");
  });

  it("claims at most 20 events and returns the claimed count", async () => {
    const store = {
      claim: vi.fn().mockResolvedValue([]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorker(store, {});

    await expect(worker.runOnce("worker-a")).resolves.toBe(0);

    expect(store.claim).toHaveBeenCalledWith(20, "worker-a");
  });
});
