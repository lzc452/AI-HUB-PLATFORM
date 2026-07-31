import type { ClaimedOutboxEvent, OutboxStorePort } from "@ai-hub/contracts";

const OUTBOX_BATCH_SIZE = 20;
const RETRY_DELAY_MS = 1_000;

type OutboxStore = Pick<OutboxStorePort, "claim" | "complete" | "fail">;

export type OutboxHandler = (event: ClaimedOutboxEvent) => Promise<void>;
export type OutboxHandlerMap = Readonly<Record<string, OutboxHandler>>;

export class OutboxWorker {
  public constructor(
    private readonly store: OutboxStore,
    private readonly handlers: OutboxHandlerMap,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async runOnce(workerId: string): Promise<number> {
    const events = await this.store.claim(OUTBOX_BATCH_SIZE, workerId);

    for (const event of events) {
      await this.handleEvent(event);
    }

    return events.length;
  }

  private async handleEvent(event: ClaimedOutboxEvent): Promise<void> {
    const handler = this.handlers[event.eventType];
    const errorCode = handler
      ? "OUTBOX_HANDLER_FAILED"
      : "OUTBOX_HANDLER_MISSING";

    try {
      if (!handler) {
        throw new Error(errorCode);
      }

      await handler(event);
      await this.store.complete(event.id);
    } catch {
      try {
        const nextAvailableAt = new Date(this.now().getTime() + RETRY_DELAY_MS);
        await this.store.fail(event.id, errorCode, nextAvailableAt);
      } catch {
        // A store failure must not prevent the rest of the claimed batch running.
      }
    }
  }
}
