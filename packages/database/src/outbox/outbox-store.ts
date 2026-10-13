import type {
  ClaimedOutboxEvent,
  OutboxClaim,
  OutboxEventInput,
  OutboxStorePort,
} from "@ai-hub/contracts";
import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../schema.js";

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const UNCLASSIFIED_ERROR = "UNCLASSIFIED_ERROR";
const DEFAULT_LEASE_DURATION_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export interface OutboxStoreOptions {
  leaseDurationMs?: number;
}

function sanitizeErrorCode(errorCode: string): string {
  return SAFE_ERROR_CODE.test(errorCode) ? errorCode : UNCLASSIFIED_ERROR;
}

export class OutboxStore implements OutboxStorePort {
  private readonly leaseDurationMs: number;

  public constructor(
    private readonly db: Kysely<DatabaseSchema>,
    options: OutboxStoreOptions = {},
  ) {
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    if (!Number.isInteger(this.leaseDurationMs) || this.leaseDurationMs <= 0) {
      throw new Error("OUTBOX_LEASE_DURATION_INVALID");
    }
  }

  public async append(input: OutboxEventInput): Promise<boolean> {
    const inserted = await this.db
      .insertInto("outbox_events")
      .values({
        event_type: input.eventType,
        aggregate_type: input.aggregateType,
        aggregate_id: input.aggregateId,
        payload: input.payload,
        idempotency_key: input.idempotencyKey,
        status: "pending",
        attempts: 0,
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        completed_at: null,
      })
      .onConflict((conflict) => conflict.column("idempotency_key").doNothing())
      .returning("id")
      .executeTakeFirst();

    return inserted !== undefined;
  }

  public async claim(
    limit: number,
    workerId: string,
  ): Promise<readonly ClaimedOutboxEvent[]> {
    if (limit <= 0) {
      return [];
    }

    return this.db.transaction().execute(async (transaction) => {
      const exhausted = await transaction
        .selectFrom("outbox_events")
        .select("id")
        .where("attempts", ">=", MAX_ATTEMPTS)
        .where((expression) =>
          expression.or([
            expression("status", "=", "pending"),
            expression.and([
              expression("status", "=", "processing"),
              expression.or([
                expression("claimed_at", "is", null),
                sql<boolean>`claimed_at <= now() - (${this.leaseDurationMs} * interval '1 millisecond')`,
              ]),
            ]),
          ]),
        )
        .orderBy("created_at")
        .forUpdate()
        .skipLocked()
        .limit(limit)
        .execute();

      if (exhausted.length > 0) {
        await transaction
          .updateTable("outbox_events")
          .set({
            status: "failed",
            claimed_by: null,
            claimed_at: null,
            last_error: sql<string>`case
              when status = 'processing' then 'OUTBOX_LEASE_EXPIRED'
              else 'OUTBOX_ATTEMPTS_EXHAUSTED'
            end`,
          })
          .where(
            "id",
            "in",
            exhausted.map((event) => event.id),
          )
          .execute();
      }

      const rows = await transaction
        .selectFrom("outbox_events")
        .select("id")
        .where((expression) =>
          expression.or([
            expression.and([
              expression("status", "=", "pending"),
              expression("attempts", "<", MAX_ATTEMPTS),
              //比较基准必须是**数据库实时时钟**（clock_timestamp），不是
              // `now()`/`transaction_timestamp()`。
              //
              // 实测缺陷：写入方用应用侧时钟 `new Date()` 填 available_at
              //（全仓 7 处，如 notification/demand/application 的 emitOutbox），
              // 而 claim 用 `available_at <= now()` 比较。两者一旦分属
              // 不同时钟基准，就出现「应用侧看已过期、数据库侧看仍在未来」，
              // 事件被**永久**排除在 claim 之外 ——
              // 表现为 outbox 事件一直 pending、通知永不投递，且无任何报错。
              //
              // 实测偏差：本机容器场景下应用时钟比数据库快约 25 秒。
              // 这不是偶发抖动，是确定性的「写入用 A 时钟、判断用 B 时钟」缺陷。
              sql<boolean>`available_at <= clock_timestamp()`,
            ]),
            expression.and([
              expression("status", "=", "processing"),
              expression("attempts", "<", MAX_ATTEMPTS),
              expression.or([
                expression("claimed_at", "is", null),
                sql<boolean>`claimed_at <= now() - (${this.leaseDurationMs} * interval '1 millisecond')`,
              ]),
            ]),
          ]),
        )
        .orderBy(
          sql`case when status = 'pending' then available_at else claimed_at end`,
        )
        .orderBy("created_at")
        .forUpdate()
        .skipLocked()
        .limit(limit)
        .execute();

      if (rows.length === 0) {
        return [];
      }

      const claimed = await transaction
        .updateTable("outbox_events")
        .set({
          status: "processing",
          claimed_by: workerId,
          claimed_at: sql<Date>`now()`,
          attempts: sql<number>`attempts + 1`,
        })
        .where(
          "id",
          "in",
          rows.map((row) => row.id),
        )
        .returning([
          "id",
          "event_type",
          "aggregate_type",
          "aggregate_id",
          "payload",
          "idempotency_key",
          "attempts",
        ])
        .execute();

      return claimed.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        payload: event.payload,
        idempotencyKey: event.idempotency_key,
        attempts: event.attempts,
      }));
    });
  }

  /**
   * 续租：handler 执行期间刷新 `claimed_at`，避免 lease 过期被他人重领。
   *
   * CAS 条件与 `complete`/`fail` 完全一致（status + claimed_by + attempts），
   * **返回 false 而不是抛错**：心跳失败是常态化的运维状况（网络抖动、
   * 事件已被他人接管），调用方需要据此知道「我已失去该事件」，
   * 而不是一个异常。若在这里抛错，worker 的心跳循环会变成噪声源。
   */
  public async heartbeat(id: string, claim: OutboxClaim): Promise<boolean> {
    const result = await this.db
      .updateTable("outbox_events")
      .set({ claimed_at: sql<Date>`now()` })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .where("claimed_by", "=", claim.workerId)
      .where("attempts", "=", claim.attempt)
      .executeTakeFirst();

    return result.numUpdatedRows === 1n;
  }

  public async complete(id: string, claim: OutboxClaim): Promise<void> {
    const result = await this.db
      .updateTable("outbox_events")
      .set({
        status: "completed",
        completed_at: sql<Date>`now()`,
        claimed_by: null,
        claimed_at: null,
      })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .where("claimed_by", "=", claim.workerId)
      .where("attempts", "=", claim.attempt)
      .executeTakeFirst();

    if (result.numUpdatedRows !== 1n) {
      throw new Error("OUTBOX_EVENT_NOT_PROCESSING");
    }
  }

  public async fail(
    id: string,
    claim: OutboxClaim,
    errorCode: string,
    nextAvailableAt: Date,
  ): Promise<void> {
    const result = await this.db
      .updateTable("outbox_events")
      .set({
        status: sql<"pending" | "failed">`case
          when attempts < ${MAX_ATTEMPTS} then 'pending'
          else 'failed'
        end`,
        available_at: nextAvailableAt,
        claimed_by: null,
        claimed_at: null,
        last_error: sanitizeErrorCode(errorCode),
      })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .where("claimed_by", "=", claim.workerId)
      .where("attempts", "=", claim.attempt)
      .executeTakeFirst();

    if (result.numUpdatedRows !== 1n) {
      throw new Error("OUTBOX_EVENT_NOT_PROCESSING");
    }
  }

  public async quarantine(
    id: string,
    claim: OutboxClaim,
    reasonCode: string,
  ): Promise<void> {
    const result = await this.db
      .updateTable("outbox_events")
      .set({
        status: "quarantined",
        claimed_by: null,
        claimed_at: null,
        last_error: sanitizeErrorCode(reasonCode),
      })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .where("claimed_by", "=", claim.workerId)
      .where("attempts", "=", claim.attempt)
      .executeTakeFirst();

    if (result.numUpdatedRows !== 1n) {
      throw new Error("OUTBOX_EVENT_NOT_PROCESSING");
    }
  }
}
