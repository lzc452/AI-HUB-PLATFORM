import type {
  ClaimedOutboxEvent,
  OutboxEventInput,
  OutboxStorePort,
} from "@ai-hub/contracts";
import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../schema.js";

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const UNCLASSIFIED_ERROR = "UNCLASSIFIED_ERROR";

function sanitizeErrorCode(errorCode: string): string {
  return SAFE_ERROR_CODE.test(errorCode) ? errorCode : UNCLASSIFIED_ERROR;
}

export class OutboxStore implements OutboxStorePort {
  public constructor(private readonly db: Kysely<DatabaseSchema>) {}

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
      const rows = await transaction
        .selectFrom("outbox_events")
        .select("id")
        .where("status", "=", "pending")
        .where("available_at", "<=", new Date())
        .orderBy("available_at")
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
          claimed_at: new Date(),
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

  public async complete(id: string): Promise<void> {
    const result = await this.db
      .updateTable("outbox_events")
      .set({
        status: "completed",
        completed_at: new Date(),
        claimed_by: null,
        claimed_at: null,
      })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .executeTakeFirst();

    if (result.numUpdatedRows !== 1n) {
      throw new Error("OUTBOX_EVENT_NOT_PROCESSING");
    }
  }

  public async fail(
    id: string,
    errorCode: string,
    nextAvailableAt: Date,
  ): Promise<void> {
    const result = await this.db
      .updateTable("outbox_events")
      .set({
        status: sql<"pending" | "failed">`case
          when attempts < 10 then 'pending'
          else 'failed'
        end`,
        available_at: nextAvailableAt,
        claimed_by: null,
        claimed_at: null,
        last_error: sanitizeErrorCode(errorCode),
      })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .executeTakeFirst();

    if (result.numUpdatedRows !== 1n) {
      throw new Error("OUTBOX_EVENT_NOT_PROCESSING");
    }
  }
}
