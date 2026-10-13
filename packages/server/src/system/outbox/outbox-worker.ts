import type { ClaimedOutboxEvent, OutboxStorePort } from "@ai-hub/contracts";

import type {
  WorkerHandlerOutcome,
  WorkerMetricsPort,
} from "../observability/metrics.js";

/**
 * 批量领取大小。
 *
 * 保持 1是有意的：一次只领一条意味着「lease 到期被抢」与「本worker 正在处理」
 * 这两件事不可能同时发生。心跳与硬超时是第二道保险，不是第一道——
 * 心跳失败后我们无法真正杀死已经发出的副作用（见 handleEvent 的说明），
 * 所以仍然选择从源头缩小竞态窗口。
 */
const OUTBOX_BATCH_SIZE = 1;
const RETRY_DELAY_MS = 1_000;
/**
 * handler 硬超时（默认 60s）。
 *
 * 没有超时时，一个卡死的 handler（例如等待一个永不 resolve 的 HTTP 调用）
 * 会让 worker 的循环永久停在这一条上——后面所有事件都得不到处理，
 * 而从外部看worker「还活着」只是不再推进，比直接崩溃更难排查。
 */
const DEFAULT_HANDLER_TIMEOUT_MS = 60_000;
/**
 * lease 心跳间隔（默认 20s）。
 *
 * 必须显著小于 store 的 lease 时长（默认 15 分钟）：心跳的作用是在
 * handler 正常执行期间持续续租，避免「事件还在处理，但 lease 已过期，
 * 被另一个 worker 重新领取并重复执行」。
 */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;

type OutboxStore = Pick<
  OutboxStorePort,
  "claim" | "complete" | "fail" | "quarantine"
>;

export type OutboxHandler = (event: ClaimedOutboxEvent) => Promise<void>;
export type OutboxHandlerMap = Readonly<Record<string, OutboxHandler>>;

export interface OutboxWorkerOptions {
  /** handler 硬超时；<=0 表示不设超时（仅建议在测试中这样配）。 */
  handlerTimeoutMs?: number;
  /** lease 心跳间隔；<=0 表示关闭心跳。 */
  heartbeatIntervalMs?: number;
}

export class OutboxWorker {
  private readonly handlerTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;

  public constructor(
    private readonly store: OutboxStore,
    private readonly handlers: OutboxHandlerMap,
    private readonly now: () => Date = () => new Date(),
    private readonly metrics?: WorkerMetricsPort,
    options: OutboxWorkerOptions = {},
  ) {
    this.handlerTimeoutMs =
      options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

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

      await this.runWithGuards(event, claim, handler);
      await this.store.complete(event.id, claim);
      outcome = "completed";
    } catch (error) {
      try {
        const nextAvailableAt = new Date(this.now().getTime() + RETRY_DELAY_MS);
        await this.store.fail(
          event.id,
          claim,
          errorCodeOf(error),
          nextAvailableAt,
        );
      } catch {
        // 存储失败不得阻止已认领批次中的其余事件继续运行。
        //
        // 这一支同时兜住了 fencing 场景：lease 过期后被他人抢走时，
        // complete/fail 的 CAS（claimed_by + attempts）会抛
        // OUTBOX_EVENT_NOT_PROCESSING —— 那是**正确行为**，说明我们已
        // 不再拥有该事件，不该再改它的状态。
      }
    } finally {
      this.metrics?.recordWorkerHandler(
        event.eventType,
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
        outcome,
      );
    }
  }

  /**
   * 在心跳续租与硬超时保护下执行 handler。
   *
   * 心跳失败**不**中止 handler：此刻 handler 的副作用可能已经发出去了
   * （HTTP 请求已发出、邮件已投递），中途放弃并不能把副作用收回，
   * 反而留下一条既没完成也没失败的事件。这里的取舍是「让它跑完」，
   * 由 `complete` 的 CAS 决定最终归属——抢不到就抛错被上面的 catch 吞掉，
   * 事件由真正的持有者处理。
   */
  private async runWithGuards(
    event: ClaimedOutboxEvent,
    claim: { workerId: string; attempt: number },
    handler: OutboxHandler,
  ): Promise<void> {
    const heartbeat = this.startHeartbeat(event.id, claim);
    try {
      if (this.handlerTimeoutMs <= 0) {
        await handler(event);
        return;
      }
      await this.withTimeout(
        handler(event),
        this.handlerTimeoutMs,
        "OUTBOX_HANDLER_TIMEOUT",
      );
    } finally {
      heartbeat.stop();
    }
  }

  private startHeartbeat(
    eventId: string,
    claim: { workerId: string; attempt: number },
  ): { stop: () => void } {
    const renew = (this.store as OutboxStore & {
      heartbeat?: (id: string, claim: { workerId: string; attempt: number }) => Promise<boolean>;
    }).heartbeat;

    if (this.heartbeatIntervalMs <= 0 || renew === undefined) {
      return { stop: () => undefined };
    }

    // unref：心跳定时器不能阻止 Node 进程自然退出，否则测试与优雅停机都会挂住。
    const timer = setInterval(() => {
      void renew
        .call(this.store, eventId, claim)
        .catch(() => undefined);
    }, this.heartbeatIntervalMs);
    (timer as unknown as { unref?: () => void }).unref?.();

    return {
      stop: () => clearInterval(timer),
    };
  }

  /**
   * 给 promise 加硬超时。
   *
   * 超时后**不取消**底层 promise（JS 无法强制中断 await 中的副作用），
   * 但必须挂一个空的 catch：否则超时后 handler 内部的异步错误会变成
   * unhandledRejection，在 Node 默认配置下直接终止进程。
   * 事件的最终状态由 store.fail 决定，与底层 promise 后续结局无关。
   */
  private async withTimeout<T>(
    task: Promise<T>,
    timeoutMs: number,
    timeoutCode: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new OutboxHandlerTimeout(timeoutCode)),
        timeoutMs,
      );
      (timer as unknown as { unref?: () => void }).unref?.();
    });

    try {
      return await Promise.race([task, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      // 无论成功、失败还是超时，都要吞掉底层 promise 的游离异常。
      void task.then(
        () => undefined,
        () => undefined,
      );
    }
  }
}

/** handler 超时错误，携带可安全落库的 error code。 */
class OutboxHandlerTimeout extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "OutboxHandlerTimeout";
  }
}

/**
 * 从任意异常提取可落库的 error code。
 *
 * `sanitizeErrorCode` 已在 store 侧兜底非法字符，这里只负责「有code 就用
 * code，没有就用通用值」：把 `error.message` 直接当 code 写库会污染
 * last_error（且可能含内部细节、长度不受控）。
 */
function errorCodeOf(error: unknown): string {
  if (
    error instanceof OutboxHandlerTimeout &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "OUTBOX_HANDLER_FAILED";
}
