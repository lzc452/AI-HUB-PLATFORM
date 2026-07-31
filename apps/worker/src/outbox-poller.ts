type OutboxPollWait = {
  promise: Promise<void>;
  stop: () => void;
};

type WaitForPollInterval = (milliseconds: number) => OutboxPollWait;
type RegisterSigtermHandler = (handleSigterm: () => void) => () => void;

export type OutboxPollingRuntime = {
  outboxWorker: {
    runOnce(workerId: string): Promise<number>;
  };
  close(): Promise<void>;
};

export function waitForPollInterval(milliseconds: number): OutboxPollWait {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  const timeout = setTimeout(() => resolvePromise?.(), milliseconds);

  return {
    promise,
    stop: () => {
      clearTimeout(timeout);
      resolvePromise?.();
    },
  };
}

function registerSigtermHandler(handleSigterm: () => void): () => void {
  process.once("SIGTERM", handleSigterm);
  return () => {
    process.off("SIGTERM", handleSigterm);
  };
}

export async function runOutboxPollingLoop(
  runtime: OutboxPollingRuntime,
  workerId: string,
  outboxPollIntervalMs: number,
  waitForNextPoll: WaitForPollInterval = waitForPollInterval,
  onSigterm: RegisterSigtermHandler = registerSigtermHandler,
): Promise<void> {
  let shuttingDown = false;
  let stopWaiting: (() => void) | undefined;

  const removeSigtermHandler = onSigterm(() => {
    shuttingDown = true;
    stopWaiting?.();
  });

  try {
    while (!shuttingDown) {
      const claimedCount = await runtime.outboxWorker.runOnce(workerId);

      if (shuttingDown) {
        break;
      }

      if (claimedCount === 0) {
        const wait = waitForNextPoll(outboxPollIntervalMs);
        stopWaiting = wait.stop;
        await wait.promise;
        stopWaiting = undefined;
      }
    }
  } finally {
    removeSigtermHandler();
    await runtime.close();
  }
}
