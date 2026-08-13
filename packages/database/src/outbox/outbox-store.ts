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
              sql<boolean>`available_at <= now()`,
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
