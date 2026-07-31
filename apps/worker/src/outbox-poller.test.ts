import { describe, expect, it, vi } from "vitest";
import { runOutboxPollingLoop } from "./outbox-poller.js";

describe("runOutboxPollingLoop", () => {
  it("claims immediately and waits only after an empty batch", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runOnce = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    const waitForPollInterval = vi.fn(() => {
      stopLoop();
      return {
        promise: Promise.resolve(),
        stop: vi.fn(),
      };
    });
    let stopLoop = () => {};

    const loop = runOutboxPollingLoop(
      { outboxWorker: { runOnce }, close },
      "worker-a",
      250,
      waitForPollInterval,
      (handleSigterm) => {
        stopLoop = handleSigterm;
        return () => {};
      },
    );

    await loop;

    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(runOnce).toHaveBeenNthCalledWith(1, "worker-a");
    expect(runOnce).toHaveBeenNthCalledWith(2, "worker-a");
    expect(waitForPollInterval).toHaveBeenCalledOnce();
    expect(waitForPollInterval).toHaveBeenCalledWith(250);
    expect(close).toHaveBeenCalledOnce();
  });

  it("stops claiming new work after SIGTERM and closes after the current batch", async () => {
    const steps: string[] = [];
    const close = vi.fn().mockImplementation(async () => {
      steps.push("close");
    });
    let stopLoop = () => {};
    const runOnce = vi.fn(async () => {
      steps.push("runOnce:start");
      stopLoop();
      await Promise.resolve();
      steps.push("runOnce:end");
      return 1;
    });

    await runOutboxPollingLoop(
      { outboxWorker: { runOnce }, close },
      "worker-a",
      250,
      () => ({
        promise: Promise.resolve(),
        stop: vi.fn(),
      }),
      (handleSigterm) => {
        stopLoop = handleSigterm;
        return () => {};
      },
    );

    expect(runOnce).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(steps).toEqual(["runOnce:start", "runOnce:end", "close"]);
  });

  it("stops waiting for the poll interval when SIGTERM arrives", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runOnce = vi.fn<() => Promise<number>>().mockResolvedValue(0);
    let stopLoop = () => {};
    let resolveWait: (() => void) | undefined;
    const stop = vi.fn(() => {
      resolveWait?.();
    });
    const loop = runOutboxPollingLoop(
      { outboxWorker: { runOnce }, close },
      "worker-a",
      250,
      () => ({
        promise: new Promise<void>((resolve) => {
          resolveWait = resolve;
        }),
        stop,
      }),
      (handleSigterm) => {
        stopLoop = handleSigterm;
        return () => {};
      },
    );

    await Promise.resolve();
    stopLoop();
    await loop;

    expect(runOnce).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
