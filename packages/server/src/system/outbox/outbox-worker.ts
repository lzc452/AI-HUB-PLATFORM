import type { ClaimedOutboxEvent, OutboxStorePort } from "@ai-hub/contracts";

import type {
  WorkerHandlerOutcome,
  WorkerMetricsPort,
} from "../observability/metrics.js";

// 在 handler 具备硬超时或 lease heartbeat 前，每次只领取一条，避免排队事件尚未执行就耗尽 lease。
const OUTBOX_BATCH_SIZE = 1;
const RETRY_DELAY_MS = 1_000;

type OutboxStore = Pick<
  OutboxStorePort,
  "claim" | "complete" | "fail" | "quarantine"
>;

export type OutboxHandler = (event: ClaimedOutboxEvent) => Promise<void>;
export type OutboxHandlerMap = Readonly<Record<string, OutboxHandler>>;

export class OutboxWorker {
  public constructor(
    private readonly store: OutboxStore,
    private readonly handlers: OutboxHandlerMap,
    private readonly now: () => Date = () => new Date(),
    private readonly metrics?: WorkerMetricsPort,
  ) {}

  public async runOnce(workerId: string): Promise<number> {
    const events = await this.store.claim(OUTBOX_BATCH_SIZE, workerId);

    for (const event of events) {
      await this.handleEvent(event, workerId);
    }

    return events.length;
  }

  private async handleEvent(
    event: ClaimedOutboxEvent,
    workerId: string,
  ): Promise<void> {
    const handler = this.handlers[event.eventType];
    const startedAt = process.hrtime.bigint();
    let outcome: WorkerHandlerOutcome = handler ? "failed" : "quarantined";
    const claim = { workerId, attempt: event.attempts };

    try {
      if (!handler) {
        await this.store.quarantine(
          event.id,
          claim,
          "OUTBOX_EVENT_TYPE_UNSUPPORTED",
        );
        return;
      }

      await handler(event);
      await this.store.complete(event.id, claim);
      outcome = "completed";
    } catch {
      try {
        const nextAvailableAt = new Date(this.now().getTime() + RETRY_DELAY_MS);
        await this.store.fail(
          event.id,
          claim,
          "OUTBOX_HANDLER_FAILED",
          nextAvailableAt,
        );
      } catch {
        // 存储失败不得阻止已认领批次中的其余事件继续运行。
      }
    } finally {
      this.metrics?.recordWorkerHandler(
        event.eventType,
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
        outcome,
      );
    }
  }
}
