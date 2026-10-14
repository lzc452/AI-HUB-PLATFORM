import { describe, expect, it, vi } from "vitest";
import type { ClaimedOutboxEvent } from "@ai-hub/contracts";
import { OutboxWorker } from "./outbox-worker.js";

function event(id: string): ClaimedOutboxEvent {
  return {
    id,
    eventType: "system.probe.requested",
    aggregateType: "system",
    aggregateId: "probe",
    payload: {},
    idempotencyKey: `${id}-key`,
    attempts: 1,
  };
}

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
      quarantine: vi.fn().mockResolvedValue(undefined),
    };
    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = new OutboxWorker(store, {
      "system.probe.requested": handler,
    });

    await expect(worker.runOnce("worker-a")).resolves.toBe(1);

    expect(handler).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith("event-1", {
      workerId: "worker-a",
      attempt: 1,
    });
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("quarantines an event whose type is unsupported without retrying it", async () => {
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
      quarantine: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorker(store, {});

    await worker.runOnce("worker-a");

    expect(store.quarantine).toHaveBeenCalledWith(
      "event-1",
      { workerId: "worker-a", attempt: 1 },
      "OUTBOX_EVENT_TYPE_UNSUPPORTED",
    );
    expect(store.fail).not.toHaveBeenCalled();
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
      quarantine: vi.fn().mockResolvedValue(undefined),
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
      { workerId: "worker-a", attempt: 1 },
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
      quarantine: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorker(store, {
      "system.first": firstHandler,
      "system.second": secondHandler,
    });

    await worker.runOnce("worker-a");

    expect(secondHandler).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith("event-2", {
      workerId: "worker-a",
      attempt: 1,
    });
  });

  it("claims one event at a time so queued work cannot consume its lease", async () => {
    const store = {
      claim: vi.fn().mockResolvedValue([]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      quarantine: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorker(store, {});

    await expect(worker.runOnce("worker-a")).resolves.toBe(0);

    expect(store.claim).toHaveBeenCalledWith(1, "worker-a");
  });

  it("records successful and failed handler outcomes", async () => {
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
        {
          id: "event-2",
          eventType: "system.failed",
          aggregateType: "system",
          aggregateId: "failed",
          payload: {},
          idempotencyKey: "failed-1",
          attempts: 1,
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      quarantine: vi.fn().mockResolvedValue(undefined),
    };
    const metrics = { recordWorkerHandler: vi.fn() };
    const worker = new OutboxWorker(
      store,
      {
        "system.probe.requested": vi.fn().mockResolvedValue(undefined),
        "system.failed": vi.fn().mockRejectedValue(new Error("secret")),
      },
      () => new Date("2026-07-31T00:00:00.000Z"),
      metrics,
    );

    await worker.runOnce("worker-a");

    expect(metrics.recordWorkerHandler).toHaveBeenCalledWith(
      "system.probe.requested",
      expect.any(Number),
      "completed",
    );
    expect(metrics.recordWorkerHandler).toHaveBeenCalledWith(
      "system.failed",
      expect.any(Number),
      "failed",
    );
  });

  describe("handler 硬超时", () => {
    it("handler 卡死超时时按 OUTBOX_HANDLER_TIMEOUT 失败，worker 不被拖死", async () => {
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        quarantine: vi.fn().mockResolvedValue(undefined),
      };
      const worker = new OutboxWorker(
        store,
        // 永不 settle —— 这正是超时机制存在的理由。
        { "system.probe.requested": () => new Promise<void>(() => {}) },
        () => new Date("2026-07-31T00:00:00.000Z"),
        undefined,
        { handlerTimeoutMs: 20, heartbeatIntervalMs: 0 },
      );

      await worker.runOnce("worker-a");

      expect(store.fail).toHaveBeenCalledWith(
        "event-1",
        { workerId: "worker-a", attempt: 1 },
        "OUTBOX_HANDLER_TIMEOUT",
        new Date("2026-07-31T00:00:01.000Z"),
      );
      expect(store.complete).not.toHaveBeenCalled();
    });

    it("超时后 handler 迟到 reject 不会变成 unhandledRejection 终止进程", async () => {
      let rejectLate: ((error: Error) => void) | undefined;
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        quarantine: vi.fn().mockResolvedValue(undefined),
      };
      const worker = new OutboxWorker(
        store,
        {
          "system.probe.requested": () =>
            new Promise<void>((_resolve, reject) => {
              rejectLate = reject;
            }),
        },
        () => new Date(),
        undefined,
        { handlerTimeoutMs: 20, heartbeatIntervalMs: 0 },
      );

      await worker.runOnce("worker-a");
      expect(store.fail).toHaveBeenCalledOnce();

      // 超时之后底层 promise 才炸：必须被吞掉。
      rejectLate?.(new Error("late failure"));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(store.complete).not.toHaveBeenCalled();
    });

    it("handler 在超时前完成则正常 complete（不误伤快handler）", async () => {
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        quarantine: vi.fn().mockResolvedValue(undefined),
      };
      const worker = new OutboxWorker(
        store,
        { "system.probe.requested": async () => undefined },
        () => new Date(),
        undefined,
        { handlerTimeoutMs: 5_000, heartbeatIntervalMs: 0 },
      );

      await worker.runOnce("worker-a");

      expect(store.complete).toHaveBeenCalledOnce();
      expect(store.fail).not.toHaveBeenCalled();
    });
  });

  describe("lease 心跳", () => {
    it("handler 执行期间周期性续租，避免 lease 过期被他人重领", async () => {
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        quarantine: vi.fn().mockResolvedValue(undefined),
        heartbeat: vi.fn().mockResolvedValue(true),
      };
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const worker = new OutboxWorker(
        store,
        {
          "system.probe.requested": async () => {
            await gate;
          },
        },
        () => new Date(),
        undefined,
        { handlerTimeoutMs: 5_000, heartbeatIntervalMs: 10 },
      );

      const running = worker.runOnce("worker-a");
      await new Promise((resolve) => setTimeout(resolve, 45));
      release?.();
      await running;

      expect(store.heartbeat).toHaveBeenCalled();
      expect(store.heartbeat).toHaveBeenCalledWith("event-1", {
        workerId: "worker-a",
        attempt: 1,
      });
      expect(store.complete).toHaveBeenCalledOnce();
    });

    it("handler 结束后停止心跳（不产生游离续租）", async () => {
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        quarantine: vi.fn().mockResolvedValue(undefined),
        heartbeat: vi.fn().mockResolvedValue(true),
      };
      const worker = new OutboxWorker(
        store,
        { "system.probe.requested": async () => undefined },
        () => new Date(),
        undefined,
        { handlerTimeoutMs: 5_000, heartbeatIntervalMs: 10 },
      );

      await worker.runOnce("worker-a");
      const callsAtEnd = store.heartbeat.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 40));

      expect(store.heartbeat.mock.calls.length).toBe(callsAtEnd);
    });

    it("心跳抛错不影响 handler 与最终 complete", async () => {
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        quarantine: vi.fn().mockResolvedValue(undefined),
        heartbeat: vi.fn().mockRejectedValue(new Error("network blip")),
      };
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const worker = new OutboxWorker(
        store,
        {
          "system.probe.requested": async () => {
            await gate;
          },
        },
        () => new Date(),
        undefined,
        { handlerTimeoutMs: 5_000, heartbeatIntervalMs: 10 },
      );

      const running = worker.runOnce("worker-a");
      await new Promise((resolve) => setTimeout(resolve, 35));
      release?.();
      await running;

      // 心跳失败是常态运维状况，不得把事件推向 failed。
      expect(store.fail).not.toHaveBeenCalled();
      expect(store.complete).toHaveBeenCalledOnce();
    });

    it("store 未实现 heartbeat 时静默跳过（端口可选）", async () => {
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        quarantine: vi.fn().mockResolvedValue(undefined),
      };
      const worker = new OutboxWorker(
        store,
        { "system.probe.requested": async () => undefined },
        () => new Date(),
        undefined,
        { handlerTimeoutMs: 5_000, heartbeatIntervalMs: 10 },
      );

      await expect(worker.runOnce("worker-a")).resolves.toBe(1);
      expect(store.complete).toHaveBeenCalledOnce();
    });
  });

  describe("fencing", () => {
    it("lease 被他人抢走导致 complete 抛 CAS 失败时，不改写他人持有的事件", async () => {
      const store = {
        claim: vi.fn().mockResolvedValue([event("event-1")]),
        // CAS 失败：事件已被别人接管。
        complete: vi
          .fn()
          .mockRejectedValue(new Error("OUTBOX_EVENT_NOT_PROCESSING")),
        fail: vi
          .fn()
          .mockRejectedValue(new Error("OUTBOX_EVENT_NOT_PROCESSING")),
        quarantine: vi.fn().mockResolvedValue(undefined),
      };
      const worker = new OutboxWorker(store, {
        "system.probe.requested": async () => undefined,
      });

      await expect(worker.runOnce("worker-a")).resolves.toBe(1);
      expect(store.complete).toHaveBeenCalledOnce();
      expect(store.quarantine).not.toHaveBeenCalled();
    });
  });
});
